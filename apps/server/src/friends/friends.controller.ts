import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import {
  CurrentUser,
  AuthUser,
} from "../common/decorators/current-user.decorator";
import { PublicIdDto } from "./dto/friends.dto";
import { FriendsService } from "./friends.service";

@UseGuards(JwtAuthGuard)
@Controller("friends")
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.friends.list(user.userId);
  }

  @Get("requests")
  requests(
    @CurrentUser() user: AuthUser,
    @Query("direction") direction?: string,
  ) {
    return this.friends.requests(
      user.userId,
      direction === "outgoing" ? "outgoing" : "incoming",
    );
  }

  @Post("requests")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  send(@CurrentUser() user: AuthUser, @Body() dto: PublicIdDto) {
    return this.friends.sendRequest(user.userId, dto.public_id);
  }

  @Post("requests/:publicId/accept")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  accept(@CurrentUser() user: AuthUser, @Param("publicId") publicId: string) {
    return this.friends.accept(user.userId, publicId);
  }

  @Post("requests/:publicId/reject")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reject(@CurrentUser() user: AuthUser, @Param("publicId") publicId: string) {
    return this.friends.reject(user.userId, publicId);
  }

  @Post("requests/:publicId/cancel")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(@CurrentUser() user: AuthUser, @Param("publicId") publicId: string) {
    return this.friends.cancel(user.userId, publicId);
  }

  @Delete(":publicId")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  remove(@CurrentUser() user: AuthUser, @Param("publicId") publicId: string) {
    return this.friends.remove(user.userId, publicId);
  }

  @Get("blocks")
  blocked(@CurrentUser() user: AuthUser) {
    return this.friends.blocked(user.userId);
  }

  @Post("blocks")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  block(@CurrentUser() user: AuthUser, @Body() dto: PublicIdDto) {
    return this.friends.block(user.userId, dto.public_id);
  }

  @Delete("blocks/:publicId")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  unblock(@CurrentUser() user: AuthUser, @Param("publicId") publicId: string) {
    return this.friends.unblock(user.userId, publicId);
  }
}
