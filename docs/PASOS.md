# Paso a paso (en este orden)

Tiempo estimado: 1 a 1.5 horas. Haz un paso, pruébalo y sigue.

## Paso 1 — Airtable: tabla `Laundry Bags` (la de siempre, renombrada)
Agrega:
- `Codigo` (texto de una línea)
- `Cantidad de maletas` (número entero; pon 1 en todas y ajusta las que tengan 2, 3 o 4)

En el campo `Status` deja estas 5 opciones exactas: `Dirty`, `Inspected`, `Washing`, `Clean`, `In Use`.
(Si hoy tiene `Assigned`, déjala; la app no la usa. Pon las maletas actuales en `Clean` o `Dirty` según estén.)

## Paso 2 — Airtable: tabla NUEVA `Ciclo de Maleta`
Crea la tabla con los campos de `LAUNDRY_SETUP.md` §1.2 (son ~33). Los obligatorios para arrancar:
`Name`, `Bag` (link a Laundry), `Cleaning de cierre` y `Cleaning de uso` (links a Cleanings), `Estado`, `Sucia el`, `Declarado por` (link a Staff),
`Condicion`, `Etiquetas condicion`, `Envia todo`, `Enviado de menos`, `Nota cleaner`, `Unidades vistas`, `Maletas llevadas`, `Maletas devueltas`,
`Inspeccionada el`, `Inspeccionado por`, `Contenido contado`, `Refrendo`, `Tratamiento especial`, `Inicio lavado`, `Fin lavado`, `Lavado por`,
`Lugar de lavado`, `Re-lavado`, `Lista el`, `Contenido final`, `Empacado por`, 
`Cargado en turno el`, `Abierta el`, `Bitacora`.

## Paso 3 — Airtable: volver a `Laundry Bags`
Agrega `Ultimo ciclo` (link a `Ciclo de Maleta`).

## Paso 4 — Airtable: tabla `Incidents`
Agrega 5 campos (ver `LAUNDRY_SETUP.md` §1.3): `Categoria`, `Activo`, `Ciclo`, `Asignado a`, `Item`.

## Paso 5 — Supabase
En SQL Editor ejecuta:
```sql
alter table profiles add column if not exists laundry_access boolean default false;
```

## Paso 6 — Vercel: proyecto nuevo `shineup-laundry`
1. Sube la carpeta `Shineup-Laundry` a un repo nuevo (o al mismo repo en carpeta aparte) y crea el proyecto en Vercel (framework Vite).
2. Variables de entorno: `AIRTABLE_TOKEN` y `AIRTABLE_BASE` (los mismos de Ops/Admin).
3. Deploy. La URL esperada es `https://shineup-laundry.vercel.app`.

## Paso 7 — Subir cambios de Ops y Admin
- `Ops-cambios/`: copia los archivos sobre el repo de Ops (misma ruta), corre `npm install` (suma `jsqr`). En Vercel de Ops agrega `VITE_LAUNDRY_API_URL=https://shineup-laundry.vercel.app` y redeploy.
- `Admin-cambios/`: copia sobre el repo de Admin y redeploy. No hay variables nuevas.

## Paso 8 — Dar acceso en Admin
Admin → Users → botón «🧺 Laundry ON» para los cleaners que hacen lavandería. (Admin y manager ya entran.)

## Paso 9 — Códigos y etiquetas
Entra a `shineup-laundry` como admin → pestaña Etiquetas → «maletas sin código» → Confirmar. Imprime las etiquetas (cada maleta física lleva su QR: `C-014-1`, `C-014-2`…).
Revisa el botón 🐞: debe listar tus columnas de ítems de Laundry (si falta o sobra alguna, avísame).

## Paso 10 — Prueba de punta a punta con 1 maleta (en HTTPS, con la cámara)
1. Ops (cleaner): «Carga de turno» → escanear el QR de la maleta → queda `In Use`.
2. Ops: abrir una limpieza de una casa de esa maleta → TERMINAR LIMPIEZA → «Sí, todo».
3. Laundry: la maleta aparece `Dirty` en la cola → Inspeccionar → Iniciar lavado → Terminar (prueba también «Nuevas +») → `Clean`.
4. Prueba la variante: dos maletas, una «Se queda en la casa» → en la inspección debe avisar que los faltantes están explicados.
5. Incidentes: crea uno de prueba y ciérralo (exige «Acción tomada»).
