import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { readMedia } from './product-images.js';

/**
 * Sirve las imágenes del catálogo. Es público a propósito (el navegador las pide con <img>, sin cabecera de
 * autorización) pero los nombres son UUID no adivinables, solo se sirven archivos generados por nosotros y
 * siempre como WebP inmutable con cabeceras que impiden que se interprete como otra cosa.
 */
@Controller('media')
@SkipThrottle()
export class MediaController {
  @Get('products/:userId/:file')
  async serve(@Param('userId') userId: string, @Param('file') file: string, @Res() res: Response) {
    const obj = await readMedia(userId, file).catch(() => null);
    if (!obj) throw new NotFoundException();
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    obj.stream.on('error', () => res.destroy()).pipe(res);
  }
}
