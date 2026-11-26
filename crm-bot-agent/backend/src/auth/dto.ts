import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() @MaxLength(160) email!: string;
  @IsString() @MaxLength(72) password!: string;
}

export class SignupDto {
  @IsEmail() @MaxLength(160) email!: string;
  // bcrypt solo usa los primeros 72 bytes: se limita para no dar falsa seguridad.
  @IsString() @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' }) @MaxLength(72)
  @Matches(/(?=.*\d)(?=.*[A-Za-z])/, { message: 'La contraseña debe combinar letras y números' }) password!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(2) @MaxLength(120) companyName!: string;
}
