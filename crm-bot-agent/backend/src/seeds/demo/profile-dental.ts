import type { Profile, ProductSeed, ScriptCtx, ScriptResult, Stage, Turn } from './types.js';

const S = (name: string, sku: string, price: number, description: string): ProductSeed =>
  ({ name, sku, category: 'Servicios', description, price, cost: 0, track: false, stock: 0, min: 0, initial: 0 });
const R = (name: string, sku: string, price: number, cost: number, initial: number, stock: number, min: number, description = ''): ProductSeed =>
  ({ name, sku, category: 'Productos', description, price, cost, track: true, initial, stock, min });

const SERVICES = ['limpieza dental', 'blanqueamiento LED', 'consulta de ortodoncia', 'resina', 'extracción simple', 'radiografía panorámica'];
const SERVICE_TITLE: Record<string, string> = { 'limpieza dental': 'Limpieza dental', 'blanqueamiento LED': 'Blanqueamiento LED', 'consulta de ortodoncia': 'Consulta de ortodoncia', resina: 'Resina', 'extracción simple': 'Extracción simple', 'radiografía panorámica': 'Radiografía panorámica' };
const PRICE: Record<string, number> = { 'limpieza dental': 35, 'blanqueamiento LED': 120, 'consulta de ortodoncia': 25, resina: 40, 'extracción simple': 45, 'radiografía panorámica': 30 };

/** Clínica Dental Jiménez: agenda de citas por WhatsApp, presupuestos y productos de cuidado bucal. */
export const dental: Profile = {
  key: 'dental', funnelTemplate: 'clinica', bcvRate: 889.26,
  agent: {
    name: 'Sofía', agentRole: 'Recepcionista virtual', businessName: 'Clínica Dental Jiménez', industry: 'Odontología', tone: 'formal',
    instructions: 'Eres Sofía, recepcionista de la Clínica Dental Jiménez. Informa tratamientos y precios del catálogo, agenda citas con día y hora confirmados, pregunta por seguro y motivo de consulta, y deriva a un humano ante dolor intenso, urgencias o presupuestos de tratamientos largos. No des diagnósticos.',
    greeting: 'Buen día, soy Sofía de la Clínica Dental Jiménez. ¿En qué podemos ayudarle?',
    restrictions: 'No emitas diagnósticos ni recomendaciones médicas. No prometas resultados de tratamientos. Ante dolor intenso o sangrado, deriva a una persona.',
    salesFlow: '1. Saludar y conocer el motivo de la consulta. 2. Informar precio y duración. 3. Ofrecer dos horarios. 4. Tomar nombre completo y seguro. 5. Confirmar la cita y avisar del recordatorio.',
    faq: [
      { question: '¿Qué seguros aceptan?', answer: 'Trabajamos con Mercantil Seguros, Seguros Caracas y Mapfre. Con otros seguros se paga y se entrega el informe para reembolso.' },
      { question: '¿Cuánto dura la limpieza?', answer: 'Entre 40 y 60 minutos. No requiere preparación previa.' },
      { question: '¿Atienden emergencias?', answer: 'Sí, de lunes a sábado en horario de consulta; escríbenos y una persona del equipo te atiende de inmediato.' },
    ],
    handoffKeywords: ['dolor', 'urgencia', 'emergencia', 'sangra', 'humano', 'doctor'],
    handoffMessage: 'Entiendo, le paso ahora mismo con una persona del equipo para atenderle de inmediato.',
    outOfHoursMessage: 'Nuestro horario es de lunes a sábado de 8:00 a 18:00. Le responderemos en cuanto abramos.',
    hours: { enabled: true, days: [1, 2, 3, 4, 5, 6], start: '08:00', end: '18:00' },
  },
  products: [
    S('Limpieza dental', 'SRV-001', 35, 'Profilaxis con ultrasonido y pulido.'), S('Blanqueamiento LED', 'SRV-002', 120, 'Sesión de 60 min con luz LED.'),
    S('Consulta de ortodoncia', 'SRV-003', 25, 'Evaluación y plan de tratamiento.'), S('Resina (por pieza)', 'SRV-004', 40, 'Restauración estética.'),
    S('Extracción simple', 'SRV-005', 45, 'Con anestesia local.'), S('Radiografía panorámica', 'SRV-006', 30, 'Imagen digital completa.'),
    R('Kit de blanqueamiento en casa', 'PRD-001', 65, 28, 20, 11, 4), R('Cepillo eléctrico', 'PRD-002', 48, 22, 15, 7, 5), R('Hilo dental (pack de 3)', 'PRD-003', 6, 2, 80, 40, 12),
    R('Enjuague bucal sin alcohol', 'PRD-004', 12, 5, 30, 3, 6), R('Pasta para dientes sensibles', 'PRD-005', 9, 3.5, 40, 0, 8), R('Protector bucal nocturno', 'PRD-006', 30, 12, 14, 9, 3),
  ],
  contactPlan: [
    { stage: 'nuevo', n: 3, ageDays: [0, 2], flags: ['unread'] }, { stage: 'nuevo', n: 1, ageDays: [0, 1], flags: ['needsHuman', 'urgent', 'unread'] },
    { stage: 'contactado', n: 3, ageDays: [1, 6] },
    { stage: 'calificado', n: 4, ageDays: [3, 12] },
    { stage: 'interesado', n: 3, ageDays: [4, 15] },
    { stage: 'negociacion', n: 2, ageDays: [6, 20] }, { stage: 'negociacion', n: 1, ageDays: [8, 12], flags: ['vip'] },
    { stage: 'cerrado', n: 6, ageDays: [10, 58] },
    { stage: 'perdido', n: 2, ageDays: [15, 45] },
  ],
  sources: ['whatsapp', 'whatsapp', 'instagram', 'meta_ad', 'referido', 'referido', 'manual'],
  tags: ['seguro-mercantil', 'ortodoncia', 'paciente-recurrente', 'blanqueamiento', 'niño'],
  templates: [
    { name: 'confirmacion_cita', category: 'UTILITY', status: 'aprobada', body: 'Hola {{1}}, su cita de {{2}} quedó confirmada para el {{3}}. Responda 1 para confirmar o 2 para reprogramar.' },
    { name: 'recordatorio_cita_24h', category: 'UTILITY', status: 'aprobada', body: 'Recordatorio: mañana tiene cita en la Clínica Dental Jiménez a las {{1}}. Si no puede asistir, avísenos por aquí.' },
    { name: 'encuesta_postconsulta', category: 'UTILITY', status: 'aprobada', body: 'Gracias por visitarnos, {{1}}. ¿Cómo fue su experiencia? Responda del 1 al 5.' },
    { name: 'promo_blanqueamiento', category: 'MARKETING', status: 'pendiente', body: 'Este mes: blanqueamiento LED con 15% de descuento. Reserve su cita respondiendo este mensaje.' },
    { name: 'recordatorio_control', category: 'UTILITY', status: 'desactivada', body: 'Han pasado 6 meses desde su última limpieza. ¿Desea agendar su control?' },
  ],
  docs: [
    { title: 'Precios y tratamientos', category: 'Tratamientos', content: 'Limpieza dental 35 USD (40-60 min). Blanqueamiento LED 120 USD (60 min). Consulta de ortodoncia 25 USD. Resina 40 USD por pieza. Extracción simple 45 USD. Radiografía panorámica 30 USD. Los tratamientos largos (ortodoncia, implantes) se presupuestan tras la evaluación y pueden pagarse en cuotas.' },
    { title: 'Seguros aceptados', category: 'Pagos', content: 'Trabajamos con Mercantil Seguros, Seguros Caracas y Mapfre con cobertura directa en limpieza, consulta y radiografías. Con otros seguros se paga en consulta y se entrega el informe y la factura para el reembolso. Aceptamos Pago Móvil, Zelle, transferencia y efectivo en divisas.' },
    { title: 'Horarios y ubicación', category: 'General', content: 'Clínica en Los Palos Grandes, Caracas. Horario de lunes a sábado de 8:00 am a 6:00 pm. Las urgencias se atienden en el mismo horario; para dolor intenso el agente deriva de inmediato a una persona del equipo.' },
    { title: 'Preparación para el blanqueamiento', category: 'Tratamientos', content: 'Se recomienda una limpieza previa. Evitar café, vino y tabaco 48 horas antes y después. Puede haber sensibilidad leve durante 24 horas. Si hay caries o encías inflamadas se tratan antes del blanqueamiento.' },
    { title: 'Cuidados después de una extracción', category: 'Postoperatorio', content: 'Morder la gasa 30 minutos, no escupir ni usar pajillas 24 horas, comida blanda y fría ese día y evitar el ejercicio intenso. Si el sangrado continúa o hay fiebre, escribir de inmediato para que una persona del equipo atienda.' },
  ],
  automations: [
    { name: 'Presupuesto sin respuesta: recordar a las 48 h', trigger: 'inactivity', conditions: { status: 'negociacion', waitHours: 48 }, actions: { sendText: 'Hola {{nombre}}, quedo atenta a su decisión sobre el presupuesto. Si tiene dudas con las cuotas, con gusto le explico.' }, runs: 11, lastRunDaysAgo: 1 },
    { name: 'Cita agendada: pasar a Calificado', trigger: 'appointment_created', conditions: {}, actions: { moveStatus: 'calificado' }, runs: 26, lastRunDaysAgo: 0 },
    { name: 'Paciente atendido: pedir opinión', trigger: 'status_changed', conditions: { toStatus: 'cerrado' }, actions: { sendText: 'Gracias por visitarnos, {{nombre}}. ¿Cómo fue su experiencia? Responda del 1 al 5.' }, runs: 19, lastRunDaysAgo: 2 },
  ],
  script(stage: Stage, c: ScriptCtx): ScriptResult {
    const f = c.first, svc = c.r.pick(SERVICES), title = SERVICE_TITLE[svc]!, price = PRICE[svc]!;
    const seguro = c.r.pick(['Mercantil Seguros', 'Seguros Caracas', 'Mapfre', 'sin seguro']);
    const q: Turn[] = [
      { s: 'client', t: `Buenas, ¿cuánto cuesta la ${svc === 'extracción simple' ? 'extracción' : svc}?` },
      { s: 'ai', t: `Buen día, ${f}. La ${svc} tiene un costo de ${price} USD (≈ ${Math.round(price * c.rate).toLocaleString('es-VE')} Bs). Atendemos de lunes a sábado de 8 a 6. ¿Desea agendar una cita?`, gapMin: 1 },
    ];
    const slots: Turn[] = [
      { s: 'client', t: 'Sí, ¿qué horarios tienen esta semana?', gapMin: 8 },
      { s: 'ai', t: 'Tengo disponible el jueves a las 10:00 am y el viernes a las 3:00 pm. ¿Cuál le conviene?', gapMin: 1 },
    ];
    const book: Turn[] = [
      { s: 'client', t: 'El jueves a las 10 está perfecto', gapMin: 6 },
      { s: 'ai', t: 'Anotado. ¿Me indica su nombre completo y si tiene seguro?', gapMin: 1 },
      { s: 'client', t: `${f}, ${seguro === 'sin seguro' ? 'no tengo seguro' : `tengo ${seguro}`}`, gapMin: 3 },
      { s: 'ai', t: `Cita agendada: ${title} el jueves a las 10:00 am. Le enviaré un recordatorio un día antes.`, gapMin: 1 },
    ];
    const appt = (days: number, hour: number, status: 'pendiente' | 'confirmada' | 'completada' | 'cancelada' | 'no_asistio', by: 'ai' | 'user' = 'ai') => ({ title, service: title, whenDaysFromNow: days, hour, status, by });
    switch (stage) {
      case 'nuevo':
        if (c.urgent) return { turns: [{ s: 'client', t: 'Me duele muchísimo una muela desde anoche, ¿pueden atenderme hoy?' }, { s: 'ai', t: 'Entiendo, le paso ahora mismo con una persona del equipo para atenderle de inmediato.', gapMin: 1 }], data: { motivo: 'dolor intenso' }, score: 60, notes: 'Urgencia: dolor intenso, requiere atención humana.' };
        return { turns: q, data: { interés: title }, score: 20, notes: 'Consulta de precio por WhatsApp.' };
      case 'contactado': return { turns: [...q, ...slots], data: { interés: title }, score: 35, notes: 'Eligiendo horario.' };
      case 'calificado': return { turns: [...q, ...slots, ...book], data: { interés: title, seguro, nombre: c.first }, score: 60, notes: 'Cita agendada por el agente.', appt: appt(c.r.int(1, 6), c.r.pick([9, 10, 11, 15, 16]), c.r.pick(['pendiente', 'confirmada'] as const)) };
      case 'interesado': return { turns: [...q,
        { s: 'client', t: '¿Qué debo hacer antes del tratamiento? ¿Duele?', gapMin: 10 },
        { s: 'ai', t: 'No requiere preparación especial y se hace con anestesia local si fuera necesario; el doctor le explicará todo en la consulta. ¿Le reservo un espacio?', gapMin: 1 },
        { s: 'client', t: 'Déjeme consultarlo con mi esposo y le confirmo', gapMin: 22 }],
        data: { interés: title, seguro }, score: 70, notes: 'Quiere consultarlo antes de agendar.' };
      case 'negociacion': return { turns: [
        { s: 'client', t: 'Hola, quisiera saber cuánto cuesta la ortodoncia completa' },
        { s: 'ai', t: 'Con gusto. Para un presupuesto exacto el doctor debe evaluarle; la consulta de ortodoncia cuesta 25 USD. ¿Desea agendarla?', gapMin: 1 },
        { s: 'client', t: 'Sí, el sábado en la mañana', gapMin: 12 },
        { s: 'ai', t: 'Cita agendada el sábado a las 9:00 am. Le atenderá el Dr. Jiménez.', gapMin: 1 },
        { s: 'human', t: `Hola ${f}, soy el ${c.human}. Tras evaluar su caso, el tratamiento completo sale en 650 USD y puede pagarse en 6 cuotas sin interés.`, gapMin: 4320 },
        { s: 'client', t: 'Déjame hablar con mi esposo y te confirmo', gapMin: 35 }],
        data: { interés: 'Ortodoncia completa', presupuesto: '650 USD', cuotas: '6' }, score: 85, notes: 'Presupuesto de ortodoncia entregado; decide en familia.',
        appt: [appt(-c.r.int(2, 5), 9, 'completada', 'ai')].map(a => ({ ...a, title: 'Consulta de ortodoncia', service: 'Consulta de ortodoncia' })) };
      case 'cerrado': return { turns: [...q, ...slots, ...book,
        { s: 'auto', t: 'Recordatorio: mañana tiene cita en la Clínica Dental Jiménez a las 10:00 am. Si no puede asistir, avísenos por aquí.', gapMin: 1440 },
        { s: 'client', t: 'Confirmado, ahí estaré', gapMin: 40 },
        { s: 'auto', t: `Gracias por visitarnos, ${f}. ¿Cómo fue su experiencia? Responda del 1 al 5.`, gapMin: 1500 },
        { s: 'client', t: c.r.pick(['5, excelente atención, gracias', '5, muy buena la doctora', '4, todo muy bien']), gapMin: 25 }],
        data: { interés: title, seguro, valoración: 'positiva' }, score: 100, notes: 'Tratamiento realizado; cliente satisfecho.',
        appt: [appt(-c.r.int(4, 40), 10, 'completada'), ...(c.r.chance(0.5) ? [{ ...appt(c.r.int(5, 20), 11, 'confirmada', 'user'), title: 'Control', service: 'Control' }] : [])] };
      default: return { turns: [...q,
        { s: 'client', t: 'Gracias, está fuera de mi presupuesto por ahora', gapMin: 30 },
        { s: 'ai', t: 'Lo entiendo. Si lo desea, la consulta de evaluación cuesta solo 25 USD y puede pagarse por partes. Quedamos atentos.', gapMin: 1 },
        { s: 'auto', t: `Hola ${f}, quedo atenta por si desea agendar su evaluación. Con gusto le ayudamos.`, gapMin: 2900 }],
        data: { motivo: 'presupuesto' }, score: 25, notes: 'Pospuso por presupuesto.',
        appt: c.r.chance(0.5) ? appt(-c.r.int(2, 8), 15, 'cancelada') : undefined };
    }
  },
};
