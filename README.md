# Sensors Mussel

Página web con mediciones de temperatura, salinidad y oxígeno disuelto en centros de cultivo de mitílidos: <https://valentinaiturra.github.io/sensorsmussel>

## Datos

Cada centro tiene una carpeta en `datos/` con los CSV descargados de su sensor, sin modificar. El separador es punto y coma, y se usan las columnas `fecha`, `temp.od` [°C], `sal.psu` [PSU] y `od.mgl` [mg/L]. La zona horaria de `fecha` está por confirmar.

Los datos de Chaparano cuentan con autorización para ser públicos.

## Actualizar un centro

1. Agregar el CSV nuevo en la carpeta del centro.
2. Agregar su ruta en `archivos`, dentro de `centros.json`.

Los archivos se unen al abrir la página. Si una fecha se repite, se usa la del último archivo de la lista.

## Agregar un centro

1. Confirmar que sus datos puedan ser públicos.
2. Crear la carpeta `datos/<id>/` y permitir sus CSV en `.gitignore`.
3. Agregar el centro en `centros.json` con `id`, `nombre` y `archivos`.

## Ver en el computador

Desde esta carpeta, ejecutar `python -m http.server` y abrir <http://localhost:8000>.
