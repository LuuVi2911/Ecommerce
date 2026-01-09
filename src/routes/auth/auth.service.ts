import { HttpException, Injectable } from '@nestjs/common'
import { addMilliseconds } from 'date-fns'
import {
  DisableTwoFactorBodyType,
  ForgotPasswordBodyType,
  LoginBodyType,
  RefreshTokenBodyType,
  RegisterBodyType,
  SendOTPBodyType,
} from 'src/routes/auth/auth.model'
import { AuthRepository } from 'src/routes/auth/auth.repo'
import { generateOTP, isNotFoundPrismaError, isUniqueConstraintPrismaError } from 'src/shared/helpers'
import { SharedUserRepository } from 'src/shared/repositories/shared-user.repo'
import { HashingService } from 'src/shared/services/hashing.service'
import { TokenService } from 'src/shared/services/token.service'
import ms, { StringValue } from 'ms'
import envConfig from 'src/shared/config'
import { TypeOfVerificationCode, TypeOfVerificationCodeType } from 'src/shared/constants/auth.constant'
import { EmailService } from 'src/shared/services/email.service'
import { AccessTokenPayloadCreate } from 'src/shared/types/jwt.type'
import {
  EmailAlreadyExistsException,
  EmailNotFoundException,
  FailedToSendOTPException,
  InvalidOTPException,
  InvalidTOTPAndCodeException,
  InvalidTOTPException,
  OTPExpiredException,
  RefreshTokenAlreadyUsedException,
  TOTPAlreadyEnabledException,
  TOTPNotEnabledException,
  UnauthorizedAccessException,
} from 'src/routes/auth/auth.error'
import { TwoFactorService } from 'src/shared/services/2fa.service'
import { InvalidPasswordException } from 'src/shared/error'
import { SharedRoleRepository } from 'src/shared/repositories/shared-role.repo'

@Injectable()
export class AuthService {
  constructor(
    private readonly hashingService: HashingService,
    private readonly sharedRoleRepository: SharedRoleRepository,
    private readonly authRepository: AuthRepository,
    private readonly sharedUserRepository: SharedUserRepository,
    private readonly emailService: EmailService,
    private readonly tokenService: TokenService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async validateVerificationCode({
    email,
    type,
    code,
  }: {
    email: string
    type: TypeOfVerificationCodeType
    code: string
  }) {
    const vevificationCode = await this.authRepository.findUniqueVerificationCode({
      email_type: {
        email,
        type,
      },
    })
    if (!vevificationCode || vevificationCode.code !== code) {
      throw InvalidOTPException
    }
    if (new Date(vevificationCode.expiresAt) < new Date()) {
      throw OTPExpiredException
    }
    return vevificationCode
  }
  async register(body: RegisterBodyType) {
    try {
      await this.validateVerificationCode({
        email: body.email,
        type: TypeOfVerificationCode.REGISTER,
        code: body.code,
      })
      const clientRoleId = await this.sharedRoleRepository.getClientRoleId()
      const hashedPassword = await this.hashingService.hash(body.password)
      const [user] = await Promise.all([
        this.authRepository.createUser({
          email: body.email,
          name: body.name,
          phoneNumber: body.phoneNumber,
          password: hashedPassword,
          roleId: clientRoleId,
        }),
        this.authRepository.deleteVerificationCode({
          email_type: {
            email: body.email,
            type: TypeOfVerificationCode.REGISTER,
          },
        }),
      ])
      return user
    } catch (error) {
      if (isUniqueConstraintPrismaError(error)) {
        throw EmailAlreadyExistsException
      }
      throw error
    }
  }

  async sendOTP(body: SendOTPBodyType) {
    const user = await this.sharedUserRepository.findUnique({
      email: body.email,
    })
    if (body.type === TypeOfVerificationCode.REGISTER && user) {
      throw EmailAlreadyExistsException
    }
    if (body.type === TypeOfVerificationCode.FORGOT_PASSWORD && !user) {
      throw EmailNotFoundException
    }
    // 2. create OTP code
    const code = generateOTP()
    await this.authRepository.createVerificationCode({
      email: body.email,
      code,
      type: body.type,
      expiresAt: addMilliseconds(new Date(), ms(envConfig.OTP_EXPIRES_IN as StringValue)).toISOString(),
    })
    // 3. send OTP code
    const { error } = await this.emailService.sendOTP({
      email: body.email,
      code,
    })
    if (error) {
      throw FailedToSendOTPException
    }
    return { message: 'OTP code sent successfully' }
  }

  async login(body: LoginBodyType & { userAgent: string; ip: string }) {
    // 1. get user information, check if user exists and password is correct
    const user = await this.authRepository.findUniqueUserIncludeRole({
      email: body.email,
    })
    if (!user) {
      throw EmailNotFoundException
    }

    const isPasswordMatch = await this.hashingService.compare(body.password, user.password)
    if (!isPasswordMatch) {
      throw InvalidPasswordException
    }
    // 2. if user has enabled 2FA, check if TOTP code or email OTP code is correct
    if (user.totpSecret) {
      // if neither TOTP code nor email OTP code is provided, add issue
      if (!body.totpCode && !body.code) {
        throw InvalidTOTPAndCodeException
      }

      // check if TOTP code is valid
      if (body.totpCode) {
        const isValid = this.twoFactorService.verifyTOTP({
          email: user.email,
          secret: user.totpSecret,
          token: body.totpCode,
        })
        if (!isValid) {
          throw InvalidTOTPException
        }
      } else if (body.code) {
        // check if email OTP code is valid
        await this.validateVerificationCode({
          email: user.email,
          type: TypeOfVerificationCode.LOGIN,
          code: body.code,
        })
      }
    }

    // 3. create new device
    const device = await this.authRepository.createDevice({
      userId: user.id,
      userAgent: body.userAgent,
      ip: body.ip,
    })

    // 4. create new accessToken and refreshToken
    const tokens = await this.generateTokens({
      userId: user.id,
      deviceId: device.id,
      roleId: user.roleId,
      roleName: user.role.name,
    })
    return tokens
  }

  async generateTokens({ userId, deviceId, roleId, roleName }: AccessTokenPayloadCreate) {
    const accessToken = this.tokenService.signAccessToken({
      userId,
      deviceId,
      roleId,
      roleName,
    })
    const refreshToken = this.tokenService.signRefreshToken({
      userId,
    })
    const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)
    await this.authRepository.createRefreshToken({
      token: refreshToken,
      userId,
      expiresAt: new Date(decodedRefreshToken.exp * 1000),
      deviceId,
    })
    return { accessToken, refreshToken }
  }

  async refreshToken({ refreshToken, userAgent, ip }: RefreshTokenBodyType & { userAgent: string; ip: string }) {
    try {
      // 1. check if refreshToken is valid
      const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)
      // 2. check if refreshToken exists in database
      const refreshTokenInDb = await this.authRepository.findUniqueRefreshTokenIncludeUserRole({
        token: refreshToken,
      })
      if (!refreshTokenInDb) {
        // if refresh token has been used, notify user that their refresh token has been stolen
        throw RefreshTokenAlreadyUsedException
      }
      const {
        deviceId,
        user: {
          roleId,
          role: { name: roleName },
        },
      } = refreshTokenInDb
      // 3. update device
      const $updateDevice = this.authRepository.updateDevice(deviceId, {
        ip,
        userAgent,
      })
      // 4. delete old refreshToken
      const $deleteRefreshToken = this.authRepository.deleteRefreshToken({
        token: refreshToken,
      })
      // 5. create new accessToken and refreshToken
      const $tokens = this.generateTokens({ userId, roleId, roleName, deviceId })
      const [, , tokens] = await Promise.all([$updateDevice, $deleteRefreshToken, $tokens])
      return tokens
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw UnauthorizedAccessException
    }
  }

  async logout(refreshToken: string) {
    try {
      // 1. check if refreshToken is valid
      await this.tokenService.verifyRefreshToken(refreshToken)
      // 2. delete refreshToken in database
      const deletedRefreshToken = await this.authRepository.deleteRefreshToken({
        token: refreshToken,
      })
      // 3. update device to be logged out
      await this.authRepository.updateDevice(deletedRefreshToken.deviceId, {
        isActive: false,
      })
      return { message: 'Logged out successfully' }
    } catch (error) {
      // if refresh token has been used, notify user that their refresh token has been stolen
      if (isNotFoundPrismaError(error)) {
        throw RefreshTokenAlreadyUsedException
      }
      throw UnauthorizedAccessException
    }
  }

  async forgotPassword(body: ForgotPasswordBodyType) {
    const { email, code, newPassword } = body
    // 1. check if email exists in database
    const user = await this.sharedUserRepository.findUnique({
      email,
    })
    if (!user) {
      throw EmailNotFoundException
    }
    //2. check if email OTP code is valid
    await this.validateVerificationCode({
      email,
      type: TypeOfVerificationCode.FORGOT_PASSWORD,
      code,
    })
    //3. update new password and delete email OTP code
    const hashedPassword = await this.hashingService.hash(newPassword)
    await Promise.all([
      this.sharedUserRepository.update(
        { id: user.id },
        {
          password: hashedPassword,
          updatedById: user.id,
        },
      ),
      this.authRepository.deleteVerificationCode({
        email_type: {
          email: body.email,
          type: TypeOfVerificationCode.FORGOT_PASSWORD,
        },
      }),
    ])
    return {
      message: 'Password changed successfully',
    }
  }

  async setupTwoFactorAuth(userId: number) {
    // 1. get user information, check if user exists and if 2FA is enabled
    const user = await this.sharedUserRepository.findUnique({
      id: userId,
    })
    if (!user) {
      throw EmailNotFoundException
    }
    if (user.totpSecret) {
      throw TOTPAlreadyEnabledException
    }
    // 2. generate secret and uri
    const { secret, uri } = this.twoFactorService.generateTOTPSecret(user.email)
    // 3. update secret in user in database
    await this.sharedUserRepository.update({ id: userId }, { totpSecret: secret, updatedById: userId })
    // 4. return secret and uri
    return {
      secret,
      uri,
    }
  }

  async disableTwoFactorAuth(data: DisableTwoFactorBodyType & { userId: number }) {
    const { userId, totpCode, code } = data
    // 1. get user information, check if user exists and if 2FA is enabled
    const user = await this.sharedUserRepository.findUnique({ id: userId })
    if (!user) {
      throw EmailNotFoundException
    }
    if (!user.totpSecret) {
      throw TOTPNotEnabledException
    }

    // 2. check if TOTP code is valid
    if (totpCode) {
      const isValid = this.twoFactorService.verifyTOTP({
        email: user.email,
        secret: user.totpSecret,
        token: totpCode,
      })
      if (!isValid) {
        throw InvalidTOTPException
      }
    } else if (code) {
      // 3. check if email OTP code is valid
      await this.validateVerificationCode({
        email: user.email,
        type: TypeOfVerificationCode.DISABLE_2FA,
        code,
      })
    }

    // 4. update secret to null
    await this.sharedUserRepository.update({ id: userId }, { totpSecret: null, updatedById: userId })

    // 5. return success message
    return {
      message: '2FA disabled successfully',
    }
  }
}
