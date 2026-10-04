import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/** Verifies the access JWT and attaches the principal to req.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extract(req);
    if (!token) throw new UnauthorizedException('Missing access token');

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      // Accept legacy UUID subjects only until existing 15-minute access
      // tokens expire; all newly issued tokens use public IDs.
      const principal = await this.prisma.user.findFirst({
        where: { OR: [{ publicId: payload.sub }, { id: payload.sub }] },
        select: { id: true, username: true, displayName: true },
      });
      if (!principal)
        throw new UnauthorizedException('Invalid or expired access token');
      (req as Request & { user: AuthUser }).user = {
        userId: principal.id,
        username: principal.username,
        displayName: principal.displayName,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  private extract(req: Request): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [type, token] = header.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
