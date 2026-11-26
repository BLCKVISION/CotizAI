import { View } from 'react-native';

import { useDatos } from '@/core/useDatos';
import { Aviso, Cargando, Columna, ErrorConReintento, Rejilla } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Texto } from '@/design/componentes';
import { TarjetaDeGrafico } from '@/design/graficos';
import { EncabezadoDePagina, Metrica, Pagina } from '@/design/layout';
import { espacio } from '@/design/tokens';
import { estadisticasApi } from '@/features/gestion/api';
import { porEstado, porFormato, porMes, porUbicacion } from '@/features/gestion/datosDeGraficos';
import { formatoDinero } from '@/features/proyectos/estados';

export default function EstadisticasPantalla() {
  const { datos: e, error, recargar } = useDatos(estadisticasApi);
  return (
    <Pagina>
      <EncabezadoDePagina sobretitulo="Estadísticas" titulo="Estadísticas" descripcion="Calculadas con los datos registrados por su organización." />
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!e ? (
        error ? null : <Cargando />
      ) : (
        <View style={{ gap: espacio.xl }}>
          <Rejilla>
            <Metrica destacada etiqueta="Proyectos" valor={e.total_proyectos} icono="folder" />
            <Metrica etiqueta="Propuestas" valor={e.total_propuestas} icono="file-text" />
            <Metrica etiqueta="Proveedores" valor={e.total_proveedores} icono="briefcase" />
          </Rejilla>
          <CollapsibleCard title="Presupuesto referencial registrado" detail={Object.keys(e.presupuestos).length === 0 ? 'Sin presupuestos registrados' : Object.entries(e.presupuestos).map(([m, v]) => formatoDinero(v, m)).join(' · ')}>
            <Texto variante="pequeno" suave>
              Cada moneda se suma por separado; aún no hay conversión con la tasa BCV.
            </Texto>
          </CollapsibleCard>
          <Rejilla>
            <Columna>
              <TarjetaDeGrafico titulo="Proyectos por estado" unidad="proyectos" datos={porEstado(e)} />
            </Columna>
            <Columna>
              <TarjetaDeGrafico titulo="Proyectos creados por mes" unidad="proyectos" forma="columnas" datos={porMes(e)} />
            </Columna>
            <Columna>
              <TarjetaDeGrafico titulo="Proyectos por ubicación" unidad="proyectos" datos={porUbicacion(e)} />
            </Columna>
            <Columna>
              <TarjetaDeGrafico titulo="Propuestas por formato" unidad="propuestas" forma="columnas" datos={porFormato(e)} />
            </Columna>
          </Rejilla>
          <Aviso tono="info" texto="Las estadísticas de propuestas válidas, descartes, costo real y ahorro aparecerán cuando el motor de evaluación esté conectado." />
        </View>
      )}
    </Pagina>
  );
}
