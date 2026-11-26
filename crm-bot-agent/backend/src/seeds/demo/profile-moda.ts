import type { Profile, ProductSeed, ScriptCtx, ScriptResult, Stage, Turn } from './types.js';

const P = (name: string, sku: string, category: string, price: number, cost: number, initial: number, stock: number, min: number, description = '', extra: Partial<ProductSeed> = {}): ProductSeed =>
  ({ name, sku, category, description, price, cost, track: true, initial, stock, min, ...extra });

const money = (p: ProductSeed, rate: number) => `${p.price} USD (≈ ${Math.round(p.price * rate).toLocaleString('es-VE')} Bs)`;
const bs = (usd: number, rate: number) => Math.round(usd * rate).toLocaleString('es-VE');

/** Casa Fonseca Moda: boutique de ropa y accesorios que vende por WhatsApp y entrega a domicilio. */
export const moda: Profile = {
  key: 'moda', funnelTemplate: 'ecommerce', bcvRate: 889.26,
  agent: {
    name: 'Valentina', agentRole: 'Asesora de ventas', businessName: 'Casa Fonseca Moda', industry: 'Moda y accesorios', tone: 'cercano',
    instructions: 'Eres Valentina, asesora de Casa Fonseca Moda, una boutique de ropa y accesorios. Ayuda a elegir prendas, informa tallas, precios (en USD y Bs a tasa BCV) y disponibilidad real del catálogo, toma el pedido con dirección y método de pago, y deriva a una persona si hay una queja o una negociación de precio.',
    greeting: '¡Hola! Soy Valentina de Casa Fonseca Moda. ¿Qué te gustaría ver hoy?',
    restrictions: 'No ofrezcas productos agotados. No des descuentos sin consultar al encargado. No prometas fechas de entrega fuera de Caracas.',
    salesFlow: '1. Saludar y entender qué busca. 2. Confirmar talla y color. 3. Ofrecer disponibilidad y precio. 4. Tomar dirección y método de pago. 5. Confirmar el pedido y avisar del despacho.',
    faq: [
      { question: '¿Hacen envíos?', answer: 'Sí. Delivery en Caracas el mismo día si el pedido se confirma antes de las 2 pm; al interior por MRW o Zoom en 2-4 días.' },
      { question: '¿Aceptan cambios?', answer: 'Cambios de talla hasta 5 días después de la compra, con la prenda sin uso y con etiqueta.' },
      { question: '¿Cómo puedo pagar?', answer: 'Pago Móvil, Zelle, transferencia o efectivo en divisas al recibir en Caracas.' },
    ],
    handoffKeywords: ['humano', 'persona', 'encargado', 'queja', 'reclamo'],
    handoffMessage: 'Entiendo. Te paso con una persona del equipo para que te atienda enseguida.',
    outOfHoursMessage: 'Estamos fuera de horario (lun-sáb 9:00 a 19:00). Te respondemos en cuanto abramos.',
    hours: { enabled: true, days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '19:00' },
  },
  products: [
    P('Camiseta básica algodón', 'CAM-001', 'Camisetas', 15, 6, 60, 38, 8, 'Algodón peinado, corte regular. Tallas S a XL.'),
    P('Franela oversize estampada', 'CAM-002', 'Camisetas', 18, 7.5, 40, 21, 6, 'Corte oversize con estampado frontal.'),
    P('Jean slim azul', 'PAN-001', 'Pantalones', 35, 16, 30, 14, 5, 'Stretch cómodo, tiro medio.'),
    P('Vestido floral midi', 'VES-001', 'Vestidos', 42, 19, 20, 6, 6, 'Tela fresca, ideal para el calor.'),
    P('Chaqueta denim', 'CHA-001', 'Abrigos', 60, 28, 15, 3, 4, 'Denim clásico, forro suave.'),
    P('Zapatillas urbanas blancas', 'ZAP-001', 'Calzado', 55, 26, 24, 0, 5, 'Suela de goma, cuero sintético.'),
    P('Gorra negra bordada', 'ACC-001', 'Accesorios', 12, 4.5, 50, 27, 8),
    P('Cinturón de cuero', 'ACC-002', 'Accesorios', 20, 8, 25, 12, 4),
    P('Bolso tote lona', 'ACC-003', 'Accesorios', 32, 14, 18, 9, 4),
    P('Pack de 3 medias', 'ACC-004', 'Accesorios', 9, 3, 80, 52, 10),
    P('Bufanda tejida', 'ACC-005', 'Accesorios', 14, 5.5, 20, 15, 4, '', { active: false }),
    P('Tarjeta de regalo', 'GIF-001', 'Servicios', 25, 0, 0, 0, 0, 'Saldo para usar en tienda.', { track: false }),
  ],
  contactPlan: [
    { stage: 'nuevo', n: 3, ageDays: [0, 2], flags: ['unread'] }, { stage: 'nuevo', n: 1, ageDays: [3, 4] },
    { stage: 'contactado', n: 3, ageDays: [1, 6] },
    { stage: 'calificado', n: 3, ageDays: [3, 12] },
    { stage: 'interesado', n: 4, ageDays: [4, 15] }, { stage: 'interesado', n: 1, ageDays: [2, 3], flags: ['needsHuman', 'unread'] },
    { stage: 'negociacion', n: 2, ageDays: [6, 20] }, { stage: 'negociacion', n: 1, ageDays: [5, 9], flags: ['vip'] },
    { stage: 'cerrado', n: 5, ageDays: [10, 58] }, { stage: 'cerrado', n: 1, ageDays: [9, 14], flags: ['needsHuman', 'unread', 'complaint'] },
    { stage: 'perdido', n: 2, ageDays: [15, 45] },
  ],
  sources: ['whatsapp', 'whatsapp', 'instagram', 'instagram', 'meta_ad', 'meta_ad', 'referido', 'manual'],
  tags: ['recurrente', 'promo-octubre', 'mayorista', 'regalo', 'talla-M', 'talla-S'],
  templates: [
    { name: 'bienvenida_tienda', category: 'UTILITY', status: 'aprobada', body: 'Hola {{1}}, gracias por escribir a Casa Fonseca Moda. ¿Qué prenda te gustaría ver hoy?' },
    { name: 'confirmacion_pedido', category: 'UTILITY', status: 'aprobada', body: 'Hola {{1}}, tu pedido #{{2}} está confirmado. Total: {{3}} USD. Te avisamos cuando salga a reparto.' },
    { name: 'pedido_en_camino', category: 'UTILITY', status: 'aprobada', body: 'Tu pedido #{{1}} ya va en camino. El repartidor llega hoy entre {{2}}.' },
    { name: 'seguimiento_cotizacion', category: 'MARKETING', status: 'pendiente', body: 'Hola {{1}}, ¿pudiste decidir? Tenemos pocas unidades de {{2}}. Si quieres te la aparto.' },
    { name: 'promo_octubre', category: 'MARKETING', status: 'rechazada', body: 'Solo esta semana: 15% de descuento en toda la colección. Escríbenos y reserva la tuya.' },
  ],
  docs: [
    { title: 'Política de envíos', category: 'Envíos', content: 'Delivery en Caracas el mismo día para pedidos confirmados antes de las 2:00 pm (costo 3 USD, gratis desde 50 USD). Envíos al interior por MRW o Zoom en 2 a 4 días hábiles; el cliente paga el flete al recibir. Guardamos el comprobante de envío y lo enviamos por WhatsApp.' },
    { title: 'Cambios y devoluciones', category: 'Postventa', content: 'Aceptamos cambios de talla o modelo hasta 5 días después de recibir la compra, con la prenda sin uso y con etiquetas. Los productos en promoción no tienen devolución de dinero; solo cambio por otra prenda. Si hay un defecto de fábrica, se reemplaza sin costo.' },
    { title: 'Métodos de pago', category: 'Pagos', content: 'Aceptamos Pago Móvil (Banesco y Mercantil), Zelle, transferencia y efectivo en divisas al entregar en Caracas. Los precios están en USD y se muestran en bolívares a la tasa oficial BCV del día.' },
    { title: 'Horario y ubicación', category: 'General', content: 'Tienda en Chacao, Caracas. Horario: lunes a sábado de 9:00 am a 7:00 pm. Atención por WhatsApp en ese mismo horario; fuera de él el agente responde y un asesor continúa al abrir.' },
    { title: 'Guía de tallas', category: 'Productos', content: 'Camisetas: S (pecho 88-92 cm), M (94-98), L (100-104), XL (106-110). Jeans: tallas 28 a 36, tiro medio. Si dudas entre dos tallas, recomendamos la mayor para corte oversize y la menor para corte slim.' },
  ],
  automations: [
    { name: 'Seguimiento a las 24 h sin respuesta', trigger: 'inactivity', conditions: { status: 'contactado', waitHours: 24 }, actions: { sendText: 'Hola {{nombre}}, ¿pudiste ver lo que te mostré? Si quieres te aparto la prenda.' }, runs: 17, lastRunDaysAgo: 1 },
    { name: 'Pedido cerrado: agradecer y pedir referido', trigger: 'status_changed', conditions: { toStatus: 'cerrado' }, actions: { sendText: '¡Gracias por tu compra, {{nombre}}! Si te gustó, cuéntaselo a una amiga y recibe 10% en tu próxima compra.' }, runs: 14, lastRunDaysAgo: 2 },
    { name: 'Cita de probador: pasar a Negociación', trigger: 'appointment_created', conditions: {}, actions: { moveStatus: 'negociacion' }, runs: 9, lastRunDaysAgo: 3 },
  ],
  script(stage: Stage, c: ScriptCtx): ScriptResult {
    const p = c.product, q = c.product2, m = money(p, c.rate), f = c.first;
    const hi: Turn[] = [
      { s: 'client', t: `Hola, buenas! Vi ${p.name} en Instagram, ¿lo tienen disponible?` },
      { s: 'ai', t: `¡Hola ${f}! Soy Valentina, la asistente de Casa Fonseca Moda. Sí, tenemos ${p.name} a ${m}. ¿Qué talla buscas?`, gapMin: 1 },
    ];
    const size = c.r.pick(['S', 'M', 'L']);
    const city = c.r.pick(['Chacao', 'Altamira', 'La Castellana', 'Los Palos Grandes', 'El Hatillo', 'Baruta']);
    const askSize: Turn[] = [
      { s: 'client', t: `Talla ${size}, ¿tienen disponible?`, gapMin: 9 },
      { s: 'ai', t: `Perfecto, en ${size} nos quedan unidades. ¿Quieres que te la aparte?`, gapMin: 1 },
    ];
    switch (stage) {
      case 'nuevo': return { turns: [...hi, { s: 'client', t: c.r.pick([`Talla ${size}. ¿Tienen en otro color?`, `Busco talla ${size}, ¿cuánto sería con envío a ${city}?`, `¿Hacen delivery a ${city}? Quiero talla ${size}`, `Me interesa, ¿tienen talla ${size}?`]), gapMin: 14 }], data: { interés: p.name }, score: 20, notes: 'Escribió por un anuncio de Instagram.' };
      case 'contactado': return { turns: [...hi, ...askSize], data: { interés: p.name, talla: size }, score: 35, notes: 'Pidió talla; falta confirmar la reserva.' };
      case 'calificado': return { turns: [...hi, ...askSize,
        { s: 'client', t: 'Sí, apártamela por favor', gapMin: 6 },
        { s: 'ai', t: '¡Listo! ¿En qué zona estás para coordinar el delivery?', gapMin: 1 },
        { s: 'client', t: `En ${city}`, gapMin: 3 },
        { s: 'ai', t: `Perfecto, llegamos a ${city} el mismo día si confirmas antes de las 2 pm. ¿Con qué método prefieres pagar?`, gapMin: 1 }],
        data: { interés: p.name, talla: size, zona: city }, score: 55, notes: 'Quiere delivery; falta método de pago.' };
      case 'interesado': return { turns: [...hi, ...askSize,
        { s: 'client', t: '¿Aceptan Pago Móvil o solo Zelle?', gapMin: 8 },
        { s: 'ai', t: 'Aceptamos Pago Móvil, Zelle, transferencia y efectivo al recibir en Caracas. Te paso los datos cuando quieras confirmar.', gapMin: 1 },
        { s: 'client', t: 'Voy a pensarlo y te escribo mañana', gapMin: 20 }],
        data: { interés: p.name, talla: size }, score: 70, notes: 'Comparando precios; quedó en escribir.',
        appt: c.r.chance(0.5) ? { title: 'Probador en tienda', service: 'Probador', whenDaysFromNow: c.r.int(1, 4), hour: c.r.pick([11, 15, 17]), status: c.r.pick(['pendiente', 'confirmada'] as const), by: 'ai' } : undefined };
      case 'negociacion': return { turns: [...hi,
        { s: 'client', t: `Quiero llevar ${p.name} y también ${q.name}. ¿Me hacen descuento?`, gapMin: 11 },
        { s: 'ai', t: 'Déjame consultarlo con el encargado y te confirmo enseguida.', gapMin: 1 },
        { s: 'human', t: `Hola ${f}, soy ${c.human}, encargado de la tienda. Por llevar las dos piezas te dejo 10% de descuento.`, gapMin: 18 },
        { s: 'client', t: 'Listo, ¿cómo te pago?', gapMin: 7 },
        { s: 'human', t: 'Pago Móvil o Zelle, te paso los datos por aquí y apartamos tu pedido.', gapMin: 3 }],
        data: { interés: `${p.name} + ${q.name}`, descuento: '10%' }, score: 85, notes: 'Negociando 2 piezas con 10% de descuento.',
        appt: { title: 'Probador en tienda', service: 'Probador', whenDaysFromNow: c.r.int(1, 3), hour: c.r.pick([12, 16]), status: 'confirmada', by: 'user' } };
      case 'cerrado': {
        const total = p.price + (c.r.chance(0.4) ? q.price : 0);
        const flow: Turn[] = [...hi,
          { s: 'client', t: `Talla ${size}, la quiero`, gapMin: 10 },
          { s: 'ai', t: 'Excelente. ¿Me das tu dirección completa para el delivery?', gapMin: 1 },
          { s: 'client', t: `${city}, edificio ${c.r.pick(['Torre Alfa', 'Residencias Sol', 'Edif. Los Pinos'])}, piso ${c.r.int(1, 12)}`, gapMin: 4 },
          { s: 'ai', t: `Gracias. El total es ${total} USD (≈ ${bs(total, c.rate)} Bs). ¿Pago Móvil o Zelle?`, gapMin: 1 },
          { s: 'client', t: `Pago Móvil, ya transferí. Referencia 00${c.r.int(1000, 9999)}`, gapMin: 9 },
          { s: 'ai', t: `Pedido confirmado #${c.orderNo}: ${p.name}. Total ${total} USD. Sale hoy mismo.`, gapMin: 2 },
          { s: 'auto', t: `Tu pedido #${c.orderNo} ya salió con nuestro repartidor. Llega hoy entre 2 y 5 pm.`, gapMin: 180 },
          { s: 'client', t: 'Recibido, muchas gracias!!', gapMin: 150 },
          { s: 'auto', t: `¡Gracias por tu compra, ${f}! Si te gustó, cuéntaselo a una amiga y recibe 10% en tu próxima compra.`, gapMin: 30 }];
        if (c.complaint) flow.push({ s: 'client', t: `Hola, me llegó la talla equivocada del pedido #${c.orderNo}`, gapMin: 2880 }, { s: 'ai', t: 'Entiendo. Te paso con una persona del equipo para que te atienda enseguida.', gapMin: 1 });
        return { turns: flow, data: { talla: size, zona: city, pago: 'Pago Móvil', pedido: `#${c.orderNo}`, total: `${total} USD` }, score: 100, notes: c.complaint ? 'Reclamo por talla: pendiente de cambio.' : 'Cliente recurrente; compra confirmada y entregada.',
          appt: c.r.chance(0.35) ? { title: 'Retiro en tienda', service: 'Retiro', whenDaysFromNow: -c.r.int(3, 10), hour: 16, status: 'completada', by: 'ai' } : undefined };
      }
      default: return { turns: [...hi,
        { s: 'client', t: 'Uff está algo caro, lo voy a pensar', gapMin: 25 },
        { s: 'ai', t: `Te entiendo. Si quieres, ${q.name} está a ${money(q, c.rate)} y tiene muy buena salida. ¿Te la muestro?`, gapMin: 1 },
        { s: 'auto', t: `Hola ${f}, ¿pudiste decidir? Esta semana tenemos envío gratis en pedidos desde 50 USD.`, gapMin: 1560 }],
        data: { motivo: 'precio' }, score: 25, notes: 'Se fue por precio; no respondió al seguimiento.' };
    }
  },
};
