# Laundry — guía de configuración (Airtable, Supabase, Vercel)

Todos los nombres de tablas y campos están centralizados en `api/_lib/schema.js`.
Si algo se llama distinto en tu base, se cambia solo ahí.

## 1. Airtable

### 1.1 Tabla `Laundry Bags` (antes `Laundry`; renómbrala en Airtable) — agregar
| Campo | Tipo | Notas |
|---|---|---|
| `Status` | Single select | Opciones exactas: `Dirty`, `Inspected`, `Washing`, `Clean`, `In Use`. Si quedan opciones viejas en español (`Sucia`, `Lista`…) la app las lee como su equivalente en inglés. |
| `Codigo` | Texto corto | `C-001`, `C-002`… (o déjalo vacío y asigna desde la app: Etiquetas → «maletas sin código») |
| `Cantidad de maletas` | Número (entero) | 1–4. Cada maleta física lleva QR `C-014-1`…`C-014-N` |
| `Ultimo ciclo` | Link a `Ciclo de Maleta` | Permite varios o uno; la app guarda 1 |

Las columnas numéricas de ítems (Sheets, Towels…) se detectan solas: cualquier campo numérico de `Laundry` que no sea `Cantidad de maletas`. El panel de diagnóstico (🐞) muestra la lista detectada.
Para forzar/excluir: variables `LAUNDRY_ITEM_FIELDS` y `LAUNDRY_ITEM_EXCLUDE` (separadas por coma).

### 1.2 Tabla nueva `Ciclo de Maleta` (una fila por viaje de la maleta)
| Campo | Tipo |
|---|---|
| `Name` | Texto (primario) |
| `Bag` | Link a `Laundry Bags` |
| `Cleaning de cierre` | Link a `Cleanings` |
| `Cleaning de uso` | Link a `Cleanings` |
| `Estado` | Single select (mismas 5 opciones que Status: `Dirty`, `Inspected`, `Washing`, `Clean`, `In Use`) |
| `Maletas llevadas` | Número (entero) |
| `Maletas devueltas` | Número (entero) |
| `Sucia el` | Fecha con hora |
| `Declarado por` | Link a `Staff` |
| `Condicion` | Single select: `Bueno`, `Normal`, `Malo` |
| `Etiquetas condicion` | Multiple select: `Manchas`, `Pelos`, `Olor`, `Húmedo`, `Roto`, `Otro` |
| `Envia todo` | Checkbox |
| `Enviado de menos` | Texto largo (JSON) |
| `Nota cleaner` | Texto largo |
| `Unidades vistas` | Texto largo (la app guarda aquí qué maleta física salió y qué pasó con cada una) |
| `Inspeccionada el` | Fecha con hora |
| `Inspeccionado por` | Link a `Staff` |
| `Contenido contado` | Texto largo (JSON) |
| `Refrendo` | Single select: `Confirmó`, `Corrigió` |
| `Tratamiento especial` | Checkbox |
| `Inicio lavado`, `Fin lavado`, `Lista el`, `Cargado en turno el`, `Abierta el` | Fecha con hora |
| `Lavado por` | Link a `Staff` |
| `Lugar de lavado` | Single select: `Propia`, `Externa` |
| `Re-lavado` | Checkbox |
| `Contenido final` | Texto largo (JSON) |
| `Empacado por` | Link a `Staff` |
| `Bitacora` | Texto largo (JSON) |

Los campos de tipo select aceptan opciones nuevas automáticamente (la app escribe con `typecast`), pero conviene crearlas para ordenar los colores.

### 1.3 Tabla `Incidents` (existente) — agregar 5 campos (diseño mínimo y genérico, reutilizable por el EAM)
| Campo | Tipo |
|---|---|
| `Categoria` | Single select: `Lavanderia`, `Mobiliario`, `Infraestructura`, `Otro` |
| `Activo` | Link a `Laundry Bags` (desmarcar campo inverso) |
| `Ciclo` | Link a `Ciclo de Maleta` (desmarcar campo inverso) |
| `Asignado a` | Link a `Staff` (lo asigna un manager después; el cleaner nunca lo llena) |
| `Item` | Texto de una línea |

El tipo del incidente viaja en el `Name` que arma la app (`C-014 · Faltante · Sheets-Q ×2`); la etapa en que se detectó queda en la `Bitacora` del ciclo; «qué se hizo» se escribe en `CloseComment` (obligatorio para cerrar).

## 2. Supabase (SQL Editor)
```sql
alter table profiles add column if not exists laundry_access boolean default false;
```
Luego en Admin → Users aparece el botón «🧺 Laundry ON/OFF» por usuario. Admin y manager entran siempre. Los cleaners operan desde Ops (no necesitan el acceso para declarar maletas).
El bucket `media` ya existe; las fotos se guardan en la carpeta `laundry/`. Debe permitir subir con la anon key (igual que Ops).

## 3. Vercel
1. Nuevo proyecto `shineup-laundry` desde la carpeta `Shineup-Laundry` (framework Vite).
2. Variables de entorno del proyecto Laundry:
   - `AIRTABLE_TOKEN` y `AIRTABLE_BASE` (los mismos valores que Ops/Admin)
   - `SUPABASE_URL` y `SUPABASE_ANON_KEY` (para validar la sesión en el backend; opcionales si el código usa los valores por defecto de tu proyecto)
   - opcionales: `LAUNDRY_ITEM_FIELDS`, `LAUNDRY_ITEM_EXCLUDE`
3. En el proyecto **Ops** agregar `VITE_LAUNDRY_API_URL=https://<dominio-laundry>.vercel.app` y redeploy. Sin esa variable el módulo queda apagado y Ops funciona igual que antes.
4. Admin: sin variables nuevas.

Funciones serverless: Laundry usa 1 (`api/laundry.js`). Ops sigue en 11 y Admin en 12 (no se añadieron).

## 4. Primer arranque
1. Crear los campos/tablas de arriba.
2. Abrir la app Laundry como admin → pestaña Etiquetas → «maletas sin código» → confirmar.
3. Imprimir etiquetas (cada maleta física trae su QR `C-014-1`…).
4. Poner `Status` de las maletas actuales en `Lista` (o `Sucia` si están sucias).
5. Abrir el panel 🐞 y revisar: ítems detectados, parámetros leídos de TARS y advertencias.
6. Probar en Ops (HTTPS requerido para la cámara): limpieza → «Abrir maleta» → terminar limpieza → declaración.

## 5. Parámetros TARS (Admin → TARS → Rules → «Laundry — maletas»)
`laundryDirtyWarnDays`=2, `laundryDirtyMaxDays`=3, `laundryRiskAmberDays`=2, `laundryRiskRedDays`=1.
