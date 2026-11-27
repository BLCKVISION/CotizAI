import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { EstadoVacio, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { auditoriaApi, etiquetaDeAccion, type Evento } from '@/core/api/management';
import { formatoFechaHora } from '@/design/projectStatus';

function groupByDay(events: Evento[]): Record<string, Evento[]> {
  const days: Record<string, Evento[]> = {};
  for (const e of events) {
    const day = new Date(e.creado).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    (days[day.charAt(0).toUpperCase() + day.slice(1)] ??= []).push(e);
  }
  return days;
}

function Registro() {
  const { datos, error, recargar } = useDatos(auditoriaApi);
  if (error) return <ErrorConReintento texto={error} onReintentar={recargar} />;
  if (!datos) return <Cargando />;
  if (datos.total === 0) return <EstadoVacio icono="shield" titulo="Sin eventos" descripcion="Las acciones del equipo aparecerán aquí." />;
  return (
    <View style={{ gap: 16 }}>
      <Aviso
        tono={datos.integra ? 'exito' : 'error'}
        texto={datos.integra ? `Cadena de ${datos.total} eventos verificada: las huellas coinciden en orden.` : 'La cadena de eventos no coincide: revise la integridad del registro.'}
      />
      {Object.entries(groupByDay(datos.eventos)).map(([day, events]) => (
        <CollapsibleCard key={day} title={day} detail={`${events.length} ${events.length === 1 ? 'acción' : 'acciones'}`}>
          {events.map((e) => (
            <Fila key={e.id} icono="activity" titulo={etiquetaDeAccion(e.accion)} detalle={`${e.actor} · ${formatoFechaHora(e.creado)}`}
              derecha={<Texto variante="pequeno" suave>#{e.secuencia} · {e.huella.slice(0, 8)}</Texto>} />
          ))}
        </CollapsibleCard>
      ))}
    </View>
  );
}

export default function AuditoriaPantalla() {
  const { usuario } = useSesion();
  return (
    <Pagina>
      <EncabezadoDePagina sobretitulo="Auditoría" titulo="Registro de acciones" descripcion="Quién hizo cada acción y en qué fecha." />
      {usuario?.rol === 'auditor' ? <Registro /> : <Aviso tono="aviso" texto="Solo el rol Auditor puede consultar este registro." />}
    </Pagina>
  );
}
