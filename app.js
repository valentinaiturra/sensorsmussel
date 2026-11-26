// Variables que se muestran: columna del CSV, nombre, unidad y color (Okabe-Ito, apto para daltonismo)
const VARIABLES = [
  { columna: "temp.od", nombre: "Temperatura", unidad: "°C", color: "#D55E00", decimales: 1 },
  { columna: "sal.psu", nombre: "Salinidad", unidad: "PSU", color: "#0072B2", decimales: 1 },
  { columna: "od.mgl", nombre: "Oxígeno disuelto", unidad: "mg/L", color: "#009E73", decimales: 1 },
];
const MS_PROMEDIO = { hora: 3600000, dia: 86400000 };

const elemento = (id) => document.getElementById(id);
let centros = [];
let datosActuales = [];
let centroActual = null;
let tipoPromedio = "hora";
let solicitud = 0; // evita mezclar centros si se cambia rápido de botón

// Completa las fechas sin hora (medianoche) con 00:00:00
function normalizarFecha(texto) {
  const fecha = texto.trim().replace("T", " ");
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha + " 00:00:00" : fecha;
}

// Se interpreta como UTC solo para restar tiempos; la hora no se convierte
const aMilisegundos = (fecha) => Date.parse(fecha.replace(" ", "T") + "Z");

function aNumero(texto) {
  if (texto === undefined || texto === "" || texto === "NA") return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

// Lee un CSV separado por punto y coma y devuelve una fila por medición
function leerCsv(texto) {
  const lineas = texto.replace(/^﻿/, "").trim().split(/\r?\n/);
  const separar = (linea) => linea.split(";").map((v) => v.replace(/^"|"$/g, ""));
  const columnas = separar(lineas[0]);
  const faltantes = ["fecha", ...VARIABLES.map((v) => v.columna)].filter((c) => !columnas.includes(c));
  if (faltantes.length) throw new Error("faltan columnas: " + faltantes.join(", "));

  return lineas.slice(1).map((linea) => {
    const valores = separar(linea);
    const fila = { fecha: normalizarFecha(valores[columnas.indexOf("fecha")] || "") };
    fila.ms = aMilisegundos(fila.fecha);
    VARIABLES.forEach((v) => { fila[v.columna] = aNumero(valores[columnas.indexOf(v.columna)]); });
    return fila;
  }).filter((fila) => Number.isFinite(fila.ms));
}

// Une los archivos de un centro; si una fecha se repite, queda la del último archivo de la lista
async function cargarCentro(centro) {
  const textos = await Promise.all(centro.archivos.map(async (ruta) => {
    const respuesta = await fetch(ruta, { cache: "no-cache" });
    if (!respuesta.ok) throw new Error("no se encontró " + ruta);
    return respuesta.text();
  }));
  const porFecha = new Map();
  textos.flatMap(leerCsv).forEach((fila) => porFecha.set(fila.ms, fila));
  return [...porFecha.values()].sort((a, b) => a.ms - b.ms);
}

const formato = (numero, decimales) =>
  numero.toLocaleString("es-CL", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

const fechaLegible = (fila) => new Date(fila.ms).toLocaleString("es-CL", {
  timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// Promedia por hora o por día, ignorando los valores sin dato.
// Los intervalos sin mediciones quedan vacíos para que la línea se corte.
function promediar(filas, ms) {
  const grupos = new Map();
  filas.forEach((fila) => {
    const inicio = Math.floor(fila.ms / ms) * ms;
    if (!grupos.has(inicio)) grupos.set(inicio, []);
    grupos.get(inicio).push(fila);
  });
  const primero = Math.floor(filas[0].ms / ms) * ms;
  const resultado = [];
  for (let inicio = primero; inicio <= filas[filas.length - 1].ms; inicio += ms) {
    const grupo = grupos.get(inicio) || [];
    const promedio = { fecha: new Date(inicio).toISOString().slice(0, 19).replace("T", " "), n: {}, min: {}, max: {} };
    VARIABLES.forEach((v) => {
      const valores = grupo.map((f) => f[v.columna]).filter((x) => x !== null);
      promedio.n[v.columna] = valores.length;
      promedio.min[v.columna] = valores.length ? Math.min(...valores) : null;
      promedio.max[v.columna] = valores.length ? Math.max(...valores) : null;
      promedio[v.columna] =valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : null;
    });
    resultado.push(promedio);
  }
  return resultado;
}

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function mostrarTarjetas(filas) {
  elemento("tarjetas").replaceChildren(...VARIABLES.map((v) => {
    const tarjeta = crear("div", "tarjeta");
    tarjeta.style.setProperty("--color", v.color);
    const cabeza = crear("div", "cabeza");
    cabeza.append(crear("div", "nombre", v.nombre));
    tarjeta.append(cabeza);
    // El valor grande es siempre el último medido, aunque se elijan otras fechas
    const ultima = datosActuales.filter((f) => f[v.columna] !== null).pop();
    if (!ultima) {
      tarjeta.append(crear("div", "detalle", "Sin datos"));
      return tarjeta;
    }
    const valor = crear("div", "valor", formato(ultima[v.columna], v.decimales) + " ");
    valor.append(crear("span", "unidad", v.unidad));
    tarjeta.append(valor, crear("div", "cuando", "Última medición registrada · " + fechaLegible(ultima)));

    // Barra de rango: dónde está el último valor entre el mínimo y el máximo de las fechas elegidas
    const conDato = filas.filter((f) => f[v.columna] !== null);
    if (conDato.length) {
      const numeros = conDato.map((f) => f[v.columna]);
      const minimo = Math.min(...numeros);
      const maximo = Math.max(...numeros);
      const fechaCorta = (f) => new Date(f.ms).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "short" });
      const posicion = maximo > minimo ? (ultima[v.columna] - minimo) / (maximo - minimo) : 0.5;

      const rango = crear("div", "rango");
      const barra = crear("div", "barra");
      const punto = crear("div", "punto");
      punto.style.left = `${Math.min(Math.max(posicion, 0), 1) * 100}%`;
      punto.title = "Última medición";
      barra.append(punto);
      const extremos = crear("div", "extremos");
      const extremo = (texto, numero) => {
        const nodo = crear("div");
        nodo.append(crear("span", "", texto + " "), formato(numero, v.decimales));
        return nodo;
      };
      extremos.append(extremo("Mín.", minimo), extremo("Máx.", maximo));
      rango.append(crear("div", "titulo-rango",
        `Rango del ${fechaCorta(conDato[0])} al ${fechaCorta(conDato[conDato.length - 1])}`), barra, extremos);
      tarjeta.append(rango);
    }
    return tarjeta;
  }));
}

function mostrarGraficos(filas) {
  const esOriginal = tipoPromedio === "original";
  VARIABLES.forEach((v, i) => {
    const id = "grafico-" + i;
    if (!elemento(id)) {
      const caja = crear("div", "grafico");
      const titulo = crear("div", "titulo");
      const nombre = crear("h3", "", `${v.nombre} [${v.unidad}] `);
      nombre.append(crear("span", "franja", "franja: mínimo a máximo"));
      const boton = crear("button", "descargar", "Descargar imagen");
      boton.type = "button";
      boton.addEventListener("click", () => descargarImagen(id, v));
      titulo.append(nombre, boton);
      const dibujo = crear("div", "dibujo");
      dibujo.id = id;
      caja.append(titulo, dibujo);
      elemento("graficos").append(caja);
    }
    elemento(id).parentElement.querySelector(".franja").hidden = esOriginal;

    const x = filas.map((f) => f.fecha);
    // Bordes invisibles que delimitan la franja mínimo–máximo
    const borde = (cual, extra) => ({
      x, y: filas.map((f) => f[cual][v.columna]), type: "scatter", mode: "lines",
      line: { width: 0 }, hoverinfo: "skip", showlegend: false, ...extra,
    });
    const linea = {
      x, y: filas.map((f) => f[v.columna]),
      type: "scatter", mode: tipoPromedio === "dia" ? "lines+markers" : "lines",
      connectgaps: false, showlegend: false,
      line: { color: v.color, width: 2 }, marker: { color: v.color, size: 8 },
      customdata: esOriginal ? undefined : filas.map((f) => [f.n[v.columna], f.min[v.columna], f.max[v.columna]]),
      hovertemplate: esOriginal ? `%{y:.2f} ${v.unidad}<extra></extra>`
        : `%{y:.2f} ${v.unidad}<br>mín. %{customdata[1]:.2f} · máx. %{customdata[2]:.2f}<br>n = %{customdata[0]}<extra></extra>`,
    };
    const trazas = esOriginal ? [linea]
      : [borde("min", {}), borde("max", { fill: "tonexty", fillcolor: v.color + "33" }), linea];

    Plotly.react(id, trazas, {
      margin: { l: 65, r: 20, t: 10, b: 50 },
      font: { family: "Segoe UI, system-ui, sans-serif", color: "#0e3b52", size: 13 },
      paper_bgcolor: "#fff", plot_bgcolor: "#fff", hovermode: "x unified", separators: ",.",
      xaxis: { title: { text: "Fecha" }, type: "date", fixedrange: true, showgrid: false, hoverformat: tipoPromedio === "dia" ? "%d-%m-%Y" : "%d-%m-%Y %H:%M",
        tickformatstops: [
          { dtickrange: [null, 86399999], value: "%H:%M\n%d-%m" },
          { dtickrange: [86400000, null], value: "%d-%m" },
        ] },
      yaxis: { title: { text: `${v.nombre} [${v.unidad}]` }, fixedrange: true, gridcolor: "#e6eef2", zeroline: false },
    }, { responsive: true, displayModeBar: false });
  });
}

// Guarda el gráfico como PNG, con el centro y la variable en el título
async function descargarImagen(id, v) {
  const grafico = elemento(id);
  const imagen = await Plotly.toImage({
    data: grafico.data,
    layout: { ...grafico.layout, title: { text: `${centroActual.nombre} · ${v.nombre}` }, margin: { l: 75, r: 30, t: 60, b: 60 } },
  }, { format: "png", width: 1100, height: 500, scale: 3 });
  const enlace = crear("a");
  enlace.href = imagen;
  enlace.download = `${centroActual.id}_${v.columna.replace(".", "_")}_${tipoPromedio}.png`;
  enlace.click();
}

// Deja seleccionado todo el registro del centro
function todasLasFechas() {
  const primera = datosActuales[0].fecha.slice(0, 10);
  const ultima = datosActuales[datosActuales.length - 1].fecha.slice(0, 10);
  [["desde", primera], ["hasta", ultima]].forEach(([id, valor]) => {
    Object.assign(elemento(id), { min: primera, max: ultima, value: valor });
  });
}

function actualizarPromedio() {
  document.querySelectorAll("#promedios button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.promedio === tipoPromedio)));
  const desde = elemento("desde").value;
  const hasta = elemento("hasta").value;
  const filas = datosActuales.filter((f) => {
    const dia = f.fecha.slice(0, 10);
    return (!desde || dia >= desde) && (!hasta || dia <= hasta);
  });
  elemento("sin-datos").hidden = filas.length > 0;
  elemento("graficos").hidden = filas.length === 0;
  mostrarTarjetas(filas);
  if (!filas.length) return;
  mostrarGraficos(tipoPromedio === "original" ? filas : promediar(filas, MS_PROMEDIO[tipoPromedio]));
}

async function elegirCentro(centro) {
  const miSolicitud = ++solicitud;
  document.querySelectorAll("#centros button").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.dataset.id === centro.id)));
  elemento("panel").hidden = true;
  elemento("mensaje").hidden = false;
  elemento("mensaje").textContent = "Cargando datos…";
  try {
    const datos = await cargarCentro(centro);
    if (miSolicitud !== solicitud) return;
    if (!datos.length) throw new Error("el archivo no tiene mediciones");
    datosActuales = datos;
    centroActual = centro;
    elemento("mensaje").hidden = true;
    elemento("panel").hidden = false;
    elemento("nombre-centro").textContent = centro.nombre;
    elemento("ultima-medicion").textContent = "Última medición: " + fechaLegible(datos[datos.length - 1]);
    todasLasFechas();
    actualizarPromedio();
  } catch (error) {
    if (miSolicitud !== solicitud) return;
    elemento("panel").hidden = true;
    elemento("mensaje").hidden = false;
    elemento("mensaje").textContent = `No se pudieron cargar los datos de ${centro.nombre}: ${error.message}`;
  }
}

async function iniciar() {
  document.querySelectorAll("#promedios button").forEach((b) =>
    b.addEventListener("click", () => { tipoPromedio = b.dataset.promedio; actualizarPromedio(); }));
  ["desde", "hasta"].forEach((id) => elemento(id).addEventListener("change", actualizarPromedio));
  elemento("todo").addEventListener("click", () => { todasLasFechas(); actualizarPromedio(); });
  try {
    const respuesta = await fetch("centros.json", { cache: "no-cache" });
    if (!respuesta.ok) throw new Error("no se encontró centros.json");
    centros = await respuesta.json();
  } catch (error) {
    elemento("mensaje").textContent = "No se pudo cargar la lista de centros: " + error.message;
    return;
  }
  elemento("centros").append(...centros.map((centro) => {
    const boton = crear("button", "", centro.nombre);
    boton.type = "button";
    boton.dataset.id = centro.id;
    boton.addEventListener("click", () => {
      history.replaceState(null, "", "#" + centro.id);
      elegirCentro(centro);
    });
    return boton;
  }), crear("span", "proximo", "Más centros próximamente"));
  // El enlace puede apuntar a un centro, por ejemplo .../sensorsmussel/#chaparano
  elegirCentro(centros.find((c) => "#" + c.id === location.hash) || centros[0]);
}

iniciar();
