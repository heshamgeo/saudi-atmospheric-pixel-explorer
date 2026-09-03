const elements = {
  map: document.getElementById("mapView"),
  slider: document.getElementById("timeSlider"),
  product: document.getElementById("productSelect"),
  mapInstruction: document.getElementById("mapInstruction"),
  mapBusy: document.getElementById("mapBusy"),
  coverage: document.getElementById("coverageLabel"),
  footer: document.getElementById("footerStatus"),
  location: document.getElementById("locationTitle"),
  status: document.getElementById("statusCard"),
  productEyebrow: document.getElementById("productEyebrow"),
  valueLabel: document.getElementById("valueMetricLabel"),
  selectedDate: document.getElementById("selectedDateMetric"),
  selectedValue: document.getElementById("selectedValueMetric"),
  average: document.getElementById("averageMetric"),
  valid: document.getElementById("validMetric"),
  rangeCount: document.getElementById("rangeCount"),
  start: document.getElementById("startDate"),
  end: document.getElementById("endDate"),
  download: document.getElementById("downloadButton"),
  chart: document.getElementById("timeSeriesChart"),
  chartEmpty: document.getElementById("chartEmpty"),
  scienceTitle: document.getElementById("scienceTitle"),
  scienceText: document.getElementById("scienceText"),
};

const DATE_DAY_MS = 86400000;
const CANCELLED = Symbol("cancelled");
let config;
let activeProduct;
let activeVariableName;
let imageryLayer;
let productLayers = new Map();
let dimensionDates = [];
let dimensionName = "StdTime";
let selectedMapDate;
let selectedPoint;
let completeSeries = [];
let chart;
let queryGeneration = 0;
let rangeTimer;

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
});

function dateKey(value) { return new Date(value).toISOString().slice(0, 10); }
function safeDate(value) {
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return safeDate(value[0]);
  if (value && typeof value === "object") return safeDate(value.value ?? value.min ?? value.start);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function setStatus(title, detail, error = false) {
  elements.status.classList.toggle("error", error);
  elements.status.innerHTML = "";
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  strong.textContent = title;
  span.textContent = detail;
  elements.status.append(strong, span);
}
function displayFormula(product) {
  const formulas = { CH4: "CH₄", CO: "CO", HCHO: "HCHO", NO2: "NO₂" };
  return formulas[product.id] ?? product.label;
}
function valueText(value) {
  return Number.isFinite(value) ? `${Number(value).toFixed(3)} ${activeProduct.units}` : "No data";
}
function nearestDate(value) {
  if (!dimensionDates.length || !value) return null;
  const wanted = value.getTime();
  return dimensionDates.reduce((best, candidate) =>
    Math.abs(candidate.getTime() - wanted) < Math.abs(best.getTime() - wanted) ? candidate : best
  );
}
function selectedSliderDate() {
  const extent = elements.slider.timeExtent;
  return nearestDate(extent?.end ?? extent?.start ?? selectedMapDate);
}
function multidimensionalDefinition(date) {
  return [{
    variableName: activeVariableName,
    dimensionName,
    values: [date.getTime()],
    isSlice: true,
  }];
}
function setLayerDate(value) {
  const date = nearestDate(value);
  if (!date || !imageryLayer) return;
  selectedMapDate = date;
  imageryLayer.multidimensionalDefinition = multidimensionalDefinition(date);
  elements.selectedDate.textContent = dateFormatter.format(date);
  updateSelectedValue();
}

function numericValue(value) {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = numericValue(entry);
      if (Number.isFinite(parsed)) return parsed;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const key of ["value", "pixelValue", "magnitude", "rawValue"]) {
      const parsed = numericValue(value[key]);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (Array.isArray(value.magdirValue)) return numericValue(value.magdirValue[0]);
    return null;
  }
  if (typeof value === "string" && /^(nodata|null|nan|)$/i.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function identifyValue(result) {
  const candidates = [
    result?.value,
    result?.pixelValue,
    result?.rawPixelValue,
    result?.pixel?.value,
    result?.pixel?.values,
    result?.dataSeries?.[0],
    result?.properties?.["Pixel Value"],
    result?.properties?.["Service Pixel Value"],
    result?.properties?.PixelValue,
  ];
  for (const candidate of candidates) {
    const parsed = numericValue(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
function seriesDate(entry, fallback) {
  if (!entry || typeof entry !== "object") return fallback;
  const definition = entry.multidimensionalDefinition;
  return safeDate(
    definition?.[0]?.values?.[0] ?? definition?.[0]?.value ?? entry.dimensionValue ?? entry.time
  ) ?? fallback;
}
function seriesValue(entry) { return numericValue(entry); }

function filteredSeries() {
  const start = elements.start.value ? new Date(`${elements.start.value}T00:00:00Z`) : null;
  const end = elements.end.value ? new Date(`${elements.end.value}T23:59:59Z`) : null;
  return completeSeries.filter((row) => (!start || row.date >= start) && (!end || row.date <= end));
}
function selectedRangeDates() {
  const start = elements.start.value ? new Date(`${elements.start.value}T00:00:00Z`) : dimensionDates[0];
  const end = elements.end.value ? new Date(`${elements.end.value}T23:59:59Z`) : dimensionDates.at(-1);
  return dimensionDates.filter((date) => date >= start && date <= end);
}
function updateSelectedValue() {
  if (!completeSeries.length || !selectedMapDate) {
    elements.selectedValue.textContent = "—";
    return;
  }
  const row = completeSeries.find((candidate) => dateKey(candidate.date) === dateKey(selectedMapDate));
  elements.selectedValue.textContent = row ? valueText(row.value) : "Outside chart range";
}
function renderChart() {
  const rows = filteredSeries();
  const validRows = rows.filter((row) => Number.isFinite(row.value));
  elements.rangeCount.textContent = `${validRows.length.toLocaleString()} valid of ${rows.length.toLocaleString()} available slices`;
  elements.valid.textContent = `${validRows.length.toLocaleString()} / ${rows.length.toLocaleString()}`;
  const average = validRows.length
    ? validRows.reduce((sum, row) => sum + row.value, 0) / validRows.length : null;
  elements.average.textContent = Number.isFinite(average) ? valueText(average) : "—";
  updateSelectedValue();
  elements.chartEmpty.hidden = rows.length > 0;
  if (!rows.length) {
    chart?.destroy(); chart = null; return;
  }
  const color = activeProduct.colors?.at(-2) ?? "#0d7066";
  const chartConfig = {
    type: "line",
    data: {
      labels: rows.map((row) => row.date.toISOString()),
      datasets: [{
        label: displayFormula(activeProduct), data: rows.map((row) => row.value),
        borderColor: color, backgroundColor: `${color}20`, borderWidth: 1.65,
        pointRadius: rows.length > 160 ? 0 : 1.7, pointHoverRadius: 4,
        fill: true, spanGaps: false, tension: 0.12,
      }],
    },
    options: {
      animation: false, maintainAspectRatio: false, normalized: true,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          title: (items) => dateFormatter.format(new Date(items[0].label)),
          label: (item) => Number.isFinite(item.raw)
            ? `${displayFormula(activeProduct)}: ${Number(item.raw).toFixed(3)} ${activeProduct.units}`
            : "No valid observation",
        }},
      },
      scales: {
        x: { grid: { display: false }, ticks: {
          autoSkip: true, maxTicksLimit: 7, color: "#6c7b76",
          callback(_value, index) {
            const label = this.getLabelForValue(index);
            return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(label));
          },
        }},
        y: { title: { display: true, text: activeProduct.units, color: "#566560" },
          grid: { color: "rgba(20, 38, 32, 0.08)" }, ticks: { color: "#6c7b76" } },
      },
    },
  };
  if (chart) { chart.data = chartConfig.data; chart.options = chartConfig.options; chart.update(); }
  else chart = new Chart(elements.chart.getContext("2d"), chartConfig);
}

function initializeRange() {
  const first = dimensionDates[0];
  const last = dimensionDates.at(-1);
  for (const input of [elements.start, elements.end]) {
    input.min = dateKey(first); input.max = dateKey(last); input.disabled = false;
  }
  setQuickRange(90, false);
}
function setQuickRange(days, query = true) {
  if (!dimensionDates.length) return;
  const last = dimensionDates.at(-1);
  const first = days === "all" ? dimensionDates[0] : new Date(last.getTime() - Number(days) * DATE_DAY_MS);
  elements.start.value = dateKey(first < dimensionDates[0] ? dimensionDates[0] : first);
  elements.end.value = dateKey(last);
  document.querySelectorAll("[data-range]").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === String(days));
  });
  if (query && selectedPoint) showPoint(selectedPoint);
}
function downloadCsv() {
  if (!selectedPoint || !completeSeries.length) return;
  const rows = filteredSeries();
  const header = ["date", `${activeProduct.id.toLowerCase()}_value`, "units", "pixel_valid", "longitude", "latitude"];
  const body = rows.map((row) => [dateKey(row.date), Number.isFinite(row.value) ? row.value : "", activeProduct.units,
    Number.isFinite(row.value) ? 1 : 0, selectedPoint.longitude.toFixed(6), selectedPoint.latitude.toFixed(6)]);
  const csv = [header, ...body].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `saudi_${activeProduct.id.toLowerCase()}_pixel_${selectedPoint.longitude.toFixed(4)}_${selectedPoint.latitude.toFixed(4)}.csv`;
  link.click(); URL.revokeObjectURL(link.href);
}

function concurrency() {
  const requested = Number(config?.queryConcurrency ?? 8);
  return Math.max(1, Math.min(12, Number.isFinite(requested) ? Math.round(requested) : 8));
}
async function identifySlice(point, date, generation) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (generation !== queryGeneration) throw CANCELLED;
    try {
      const result = await imageryLayer.identify(point, {
        multidimensionalDefinition: multidimensionalDefinition(date),
      });
      if (generation !== queryGeneration) throw CANCELLED;
      return { date, value: identifyValue(result), requestFailed: false };
    } catch (error) {
      if (generation !== queryGeneration) throw CANCELLED;
      if (attempt === 2) return { date, value: null, requestFailed: true, error: String(error) };
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  return { date, value: null, requestFailed: true };
}
async function queryCompatibleSeries(point, dates, generation) {
  const output = new Array(dates.length);
  let cursor = 0;
  let finished = 0;
  async function worker() {
    while (generation === queryGeneration) {
      const index = cursor;
      cursor += 1;
      if (index >= dates.length) return;
      output[index] = await identifySlice(point, dates[index], generation);
      finished += 1;
      if (finished === dates.length || finished % Math.max(4, concurrency()) === 0) {
        setStatus(
          `Reading ${displayFormula(activeProduct)} history`,
          `${finished.toLocaleString()} of ${dates.length.toLocaleString()} time slices retrieved.`
        );
      }
    }
    throw CANCELLED;
  }
  await Promise.all(Array.from({ length: Math.min(concurrency(), dates.length) }, worker));
  return output;
}
async function queryTransposedSeries(point, dates, generation) {
  const result = await imageryLayer.identify(point, { transposedVariableName: activeVariableName });
  if (generation !== queryGeneration) throw CANCELLED;
  if (!Array.isArray(result.dataSeries) || !result.dataSeries.length) {
    throw new Error("The transpose returned no data series.");
  }
  const wanted = new Set(dates.map(dateKey));
  return result.dataSeries.map((entry, index) => ({
    date: seriesDate(entry, dimensionDates[index] ?? dimensionDates.at(-1)),
    value: seriesValue(entry), requestFailed: false,
  })).filter((row) => row.date && wanted.has(dateKey(row.date))).sort((a, b) => a.date - b.date);
}
async function queryPixelSeries(point, dates, generation) {
  if (imageryLayer.serviceRasterInfo?.hasMultidimensionalTranspose) {
    try {
      return await queryTransposedSeries(point, dates, generation);
    } catch (error) {
      if (error === CANCELLED) throw error;
      console.warn("Transpose query failed; using compatible slice queries.", error);
    }
  }
  return queryCompatibleSeries(point, dates, generation);
}
async function showPoint(point) {
  if (!point || !imageryLayer) return;
  const dates = selectedRangeDates();
  if (!dates.length) {
    setStatus("No published slices in this range", "Choose a wider date range and click the map again.", true);
    return;
  }
  const generation = ++queryGeneration;
  selectedPoint = point; completeSeries = [];
  elements.download.disabled = true;
  elements.mapBusy.hidden = false; elements.mapInstruction.hidden = true;
  elements.location.textContent = `${point.latitude.toFixed(4)}°N, ${point.longitude.toFixed(4)}°E`;
  const mode = imageryLayer.serviceRasterInfo?.hasMultidimensionalTranspose
    ? "optimized cube query" : `${concurrency()} parallel slice requests`;
  setStatus(
    `Reading ${displayFormula(activeProduct)} history`,
    `${dates.length.toLocaleString()} published slices using ${mode}.`
  );
  try {
    const rows = await queryPixelSeries(point, dates, generation);
    if (generation !== queryGeneration) return;
    completeSeries = rows.sort((a, b) => a.date - b.date);
    const validCount = completeSeries.filter((row) => Number.isFinite(row.value)).length;
    const failedCount = completeSeries.filter((row) => row.requestFailed).length;
    renderChart();
    elements.download.disabled = false;
    setStatus(
      "Pixel time series ready",
      `${validCount.toLocaleString()} valid observations from ${dates.length.toLocaleString()} published slices${failedCount ? `; ${failedCount} requests could not be read` : ""}.`,
      failedCount === dates.length
    );
    elements.footer.textContent = `${displayFormula(activeProduct)} query complete · change the parameter to compare this location`;
    elements.map.view.graphics.removeAll();
    const Graphic = await $arcgis.import("@arcgis/core/Graphic.js");
    elements.map.view.graphics.add(new Graphic({ geometry: point, symbol: {
      type: "simple-marker", color: "#f6d67f", size: 10, outline: { color: "#073a35", width: 2 },
    }}));
  } catch (error) {
    if (error === CANCELLED || generation !== queryGeneration) return;
    console.error(error); setStatus("Pixel query failed", error.message || String(error), true);
    elements.mapInstruction.hidden = false;
  } finally {
    if (generation === queryGeneration) elements.mapBusy.hidden = true;
  }
}

async function layerFor(product) {
  if (productLayers.has(product.id)) return productLayers.get(product.id);
  if (!product.imageryItemId && !product.imageryUrl) {
    throw new Error(`${product.id} has not been published yet.`);
  }
  const ImageryTileLayer = await $arcgis.import("@arcgis/core/layers/ImageryTileLayer.js");
  const properties = {
    id: `aq-pixel-explorer-${product.id.toLowerCase()}`,
    title: product.title,
    visible: false,
    opacity: 0.88,
    listMode: "show",
  };
  if (product.imageryItemId) properties.portalItem = { id: product.imageryItemId };
  else properties.url = product.imageryUrl;
  const layer = new ImageryTileLayer(properties);
  elements.map.map.add(layer);
  await layer.load();
  productLayers.set(product.id, layer);
  return layer;
}
function resetSeries() {
  completeSeries = [];
  chart?.destroy(); chart = null;
  elements.chartEmpty.hidden = false;
  elements.download.disabled = true;
  elements.average.textContent = "—"; elements.valid.textContent = "—";
  elements.selectedValue.textContent = "—"; elements.rangeCount.textContent = "No pixel selected";
}
async function activateProduct(productId, queryPoint = true) {
  const product = config.products.find((row) => row.id === productId);
  if (!product) return;
  queryGeneration += 1;
  elements.mapBusy.hidden = true;
  setStatus(`Loading ${displayFormula(product)}`, "Connecting directly to its published multidimensional imagery item.");
  const layer = await layerFor(product);
  await layer.load();
  productLayers.forEach((candidate) => { candidate.visible = candidate === layer; });
  imageryLayer = layer; activeProduct = product; layer.visible = true;
  const variables = layer.serviceRasterInfo?.multidimensionalInfo?.variables ?? [];
  const variable = variables.find((row) => row.name === product.variableName) ?? variables[0];
  const dimension = variable?.dimensions?.find((row) => row.name === "StdTime") ?? variable?.dimensions?.[0];
  if (!variable || !dimension?.values?.length) throw new Error(`${product.id} contains no readable time dimension.`);
  activeVariableName = variable.name;
  dimensionName = dimension.name;
  dimensionDates = dimension.values.map(safeDate).filter(Boolean).sort((a, b) => a - b);
  selectedMapDate = dimensionDates.at(-1);
  elements.slider.fullTimeExtent = { start: dimensionDates[0], end: dimensionDates.at(-1) };
  elements.slider.stops = { dates: dimensionDates };
  elements.slider.timeExtent = { start: selectedMapDate, end: selectedMapDate };
  setLayerDate(selectedMapDate);
  initializeRange();
  elements.coverage.textContent = `${product.id} · ${dimensionDates.length.toLocaleString()} slices · ${dateKey(dimensionDates[0])} to ${dateKey(dimensionDates.at(-1))}`;
  elements.productEyebrow.textContent = `${displayFormula(product)} selected location`;
  elements.valueLabel.textContent = `${displayFormula(product)} value`;
  elements.scienceTitle.textContent = `${displayFormula(product)} · ${product.units}`;
  elements.scienceText.textContent = `${product.description} This is a satellite column product, not a surface concentration or AQI. Gaps are unavailable or quality-rejected observations.`;
  resetSeries();
  const modeText = layer.serviceRasterInfo?.hasMultidimensionalTranspose
    ? "Optimized time-series access is available."
    : "Compatible range-based pixel queries are enabled.";
  setStatus(`${displayFormula(product)} connected`, `${modeText} Choose a range and click a colored pixel.`);
  elements.footer.textContent = `${displayFormula(product)} connected · click the map to build its pixel chart`;
  if (queryPoint && selectedPoint) await showPoint(selectedPoint);
}

async function initialize() {
  try {
    config = await fetch("config.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("config.json could not be loaded"); return response.json();
    });
    if (!config.webMapItemId) throw new Error("The Web Map item ID is not configured.");
    if (!Array.isArray(config.products) || !config.products.length) throw new Error("No product cube is configured.");
    for (const product of config.products) {
      const option = document.createElement("option"); option.value = product.id;
      option.textContent = `${displayFormula(product)} — ${product.description}`;
      elements.product.append(option);
    }
    elements.product.value = config.products.some((row) => row.id === config.defaultProduct)
      ? config.defaultProduct : config.products[0].id;
    elements.map.setAttribute("item-id", config.webMapItemId);
    await elements.map.viewOnReady(); await elements.map.map.loadAll();
    elements.map.map.allLayers.forEach((layer) => {
      if (["imagery", "imagery-tile"].includes(layer.type)) {
        layer.visible = false;
        layer.listMode = "hide";
      }
      if (layer.id === "aq_saudi_arabia_atmospheric_composition_cubes") {
        layer.visible = false;
        layer.listMode = "hide";
      }
    });
    await activateProduct(elements.product.value, false);
    if (imageryLayer.fullExtent) await elements.map.view.goTo(imageryLayer.fullExtent.expand(1.06), { duration: 700 }).catch(() => {});
    elements.map.addEventListener("arcgisViewClick", (event) => showPoint(event.detail.mapPoint));
    elements.slider.addEventListener("arcgisPropertyChange", (event) => {
      if (event.detail?.name === "timeExtent") setLayerDate(selectedSliderDate());
    });
    elements.product.addEventListener("change", async () => {
      try { await activateProduct(elements.product.value); }
      catch (error) { console.error(error); setStatus("Parameter unavailable", error.message || String(error), true); }
    });
  } catch (error) {
    console.error(error); setStatus("Explorer is not ready", error.message || String(error), true);
    elements.footer.textContent = "Configuration or ArcGIS access is incomplete";
    elements.mapInstruction.hidden = true;
  }
}

function customRangeChanged() {
  if (elements.start.value > elements.end.value) elements.end.value = elements.start.value;
  document.querySelectorAll("[data-range]").forEach((button) => button.classList.remove("active"));
  clearTimeout(rangeTimer);
  if (selectedPoint) rangeTimer = setTimeout(() => showPoint(selectedPoint), 450);
}
elements.start.addEventListener("change", customRangeChanged);
elements.end.addEventListener("change", () => {
  if (elements.end.value < elements.start.value) elements.start.value = elements.end.value;
  customRangeChanged();
});
document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => setQuickRange(button.dataset.range)));
elements.download.addEventListener("click", downloadCsv);
initialize();
