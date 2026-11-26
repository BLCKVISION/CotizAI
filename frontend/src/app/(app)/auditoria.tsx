import { View } from 'react-native';

import { useSesion } from '@/core/sesion/SesionProvider';
import { useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Fila } from '@/design/bloques';
import { EstadoVacio, Tarjeta, Texto } from '@/design/componentes';
import { EncabezadoDePagina, Pagina } from '@/design/layout';
import { auditoriaApi, etiquetaDeAccion } from '@/features/gestion/api';
import { formatoFechaHora } from '@/features/proyectos/estados';

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
      <Tarjeta>
        {datos.eventos.map((e) => (
          <Fila key={e.id} icono="activity" titulo={etiquetaDeAccion(e.accion)} detalle={`${e.actor} · ${formatoFechaHora(e.creado)}`}
            derecha={<Texto variante="pequeno" suave>#{e.secuencia} · {e.huella.slice(0, 8)}</Texto>} />
        ))}
      </Tarjeta>
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
