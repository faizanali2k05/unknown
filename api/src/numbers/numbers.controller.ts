import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { NumbersService } from './numbers.service';
import { CreateNumberDto, UpdateNumberDto } from './dto/numbers.dto';

@UseGuards(JwtAuthGuard)
@Controller('numbers')
export class NumbersController {
  constructor(private readonly numbers: NumbersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.numbers.list(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNumberDto) {
    return this.numbers.create(user.userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateNumberDto,
  ) {
    return this.numbers.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.numbers.remove(user.userId, id);
  }
}
