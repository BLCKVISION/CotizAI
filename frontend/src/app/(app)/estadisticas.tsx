import { View } from 'react-native';

import { useDatos } from '@/core/useDatos';
import { Aviso, Cargando, ErrorConReintento, Rejilla } from '@/design/bloques';
import { CollapsibleCard } from '@/design/Collapsible';
import { Icono, Tarjeta, Texto } from '@/design/componentes';
import { useDispositivo } from '@/design/dispositivo';
import { TarjetaDeGrafico } from '@/design/graficos';
import { EncabezadoDePagina, Metrica, Pagina } from '@/design/layout';
import { useTema } from '@/design/tema';
import { espacio, radio } from '@/design/tokens';
import { estadisticasApi, type Estadisticas } from '@/features/gestion/api';
import { porEstado, porFormato, porMes, porUbicacion } from '@/features/gestion/datosDeGraficos';
import { formatoMonto } from '@/features/proyectos/estados';

const CURRENCY_NAME: Record<string, string> = { USD: 'Dólares (USD)', VES: 'Bolívares (VES)' };

/** Four in a row on wide screens, two by two on laptops, one per row on phones. */
const FOUR_COLUMNS_FROM = 1500;

const charts = (e: Estadisticas) => [
  { titulo: 'Proyectos por estado', unidad: 'proyectos', datos: porEstado(e) },
  { titulo: 'Proyectos creados por mes', unidad: 'proyectos', forma: 'columnas' as const, datos: porMes(e) },
  { titulo: 'Proyectos por ubicación', unidad: 'proyectos', datos: porUbicacion(e) },
  { titulo: 'Propuestas por formato', unidad: 'propuestas', forma: 'columnas' as const, datos: porFormato(e) },
];

function Budgets({ budgets }: { budgets: Record<string, string> }) {
  const t = useTema();
  const entries = Object.entries(budgets);
  return (
    <Tarjeta>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: radio.pildora, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icono nombre="dollar-sign" color={t.onAccent} />
        </View>
        <Texto variante="cuerpoMedio" accessibilityRole="header" style={{ fontFamily: 'Urbanist_600SemiBold' }}>
          Presupuesto referencial registrado
        </Texto>
      </View>
      {entries.length === 0 ? (
        <Texto suave>Sin presupuestos registrados.</Texto>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espacio.md }}>
          {entries.map(([currency, amount]) => (
            <View key={currency} style={{ flexGrow: 1, flexBasis: 240, padding: espacio.md, borderRadius: radio.lg, backgroundColor: t.superficieAlta }}>
              <Texto variante="pequeno" suave>
                {CURRENCY_NAME[currency] ?? currency}
              </Texto>
              <Texto variante="titulo">
                {currency === 'VES' ? 'Bs.' : 'USD'} {formatoMonto(amount)}
              </Texto>
            </View>
          ))}
        </View>
      )}
      <Texto variante="pequeno" suave>
        Cada moneda se suma por separado.
      </Texto>
    </Tarjeta>
  );
}

export default function StatisticsScreen() {
  const { datos, error, recargar } = useDatos(estadisticasApi);
  const { ancho, dispositivo } = useDispositivo();
  const chartColumns = dispositivo === 'movil' ? 1 : ancho >= FOUR_COLUMNS_FROM ? 4 : 2;
  const e = datos;
  return (
    <Pagina>
      <EncabezadoDePagina
        sobretitulo="Estadísticas"
        titulo="Estadísticas"
        descripcion="Calculadas con los datos registrados por su organización."
      />
      {error ? <ErrorConReintento texto={error} onReintentar={recargar} /> : null}
      {!e ? (
        error ? null : <Cargando />
      ) : (
        <View style={{ gap: espacio.lg }}>
          <Rejilla>
            <Metrica destacada etiqueta="Proyectos" valor={e.total_proyectos} icono="folder" />
            <Metrica etiqueta="Propuestas" valor={e.total_propuestas} icono="file-text" />
            <Metrica etiqueta="Proveedores" valor={e.total_proveedores} icono="briefcase" />
          </Rejilla>
          <Budgets budgets={e.presupuestos} />
          {/* Four separate cards, each folded by default: the numbers above already say the essentials. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -espacio.sm, rowGap: espacio.md, alignItems: 'flex-start' }}>
            {charts(e).map((chart) => (
              <View key={chart.titulo} style={{ width: `${100 / chartColumns}%`, paddingHorizontal: espacio.sm }}>
                <CollapsibleCard title={chart.titulo} detail={`${chart.datos.length} ${chart.datos.length === 1 ? 'categoría' : 'categorías'}`}>
                  <TarjetaDeGrafico {...chart} />
                </CollapsibleCard>
              </View>
            ))}
          </View>
          <Aviso tono="info" texto="Los resultados de cada evaluación (válidas, descartes y costo real) se consultan dentro de su proyecto." />
        </View>
      )}
    </Pagina>
  );
}
