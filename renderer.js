let selectedFilePaths = [];
let previewTimer = null;
let previewRequest = 0;

const dropZone = document.getElementById('drop-zone');
const fileList = document.getElementById('file-list');
const convertBtn = document.getElementById('convert-btn');
const clearBtn = document.getElementById('clear-btn');
const results = document.getElementById('results');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('quality-value');
const qualityLabel = document.getElementById('quality-label');
const maxWidthInput = document.getElementById('max-width');
const maxHeightInput = document.getElementById('max-height');
const targetKbInput = document.getElementById('target-kb');

const outputDirLabel = document.getElementById('output-dir');
const resetOutputDirBtn = document.getElementById('reset-output-dir');

const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'];

function getOptions() {
  return {
    quality: qualitySlider.value,
    width: maxWidthInput.value,
    height: maxHeightInput.value,
    targetKB: targetKbInput.value,
    outputDir
  };
}

// "Save to" folder shared by both tabs. Empty means next to each original. Remembered between runs.
const OUTPUT_DIR_KEY = 'outputDir';
let outputDir = '';
try {
  outputDir = localStorage.getItem(OUTPUT_DIR_KEY) || '';
} catch (error) {
  outputDir = '';
}
showOutputDir();

function setOutputDir(dir) {
  outputDir = dir || '';
  try {
    if (outputDir) localStorage.setItem(OUTPUT_DIR_KEY, outputDir);
    else localStorage.removeItem(OUTPUT_DIR_KEY);
  } catch (error) {
    // Not remembered next time, but still used this session.
  }
  showOutputDir();
}

function showOutputDir() {
  outputDirLabel.textContent = outputDir || 'Same folder as original';
  outputDirLabel.title = outputDir;
  resetOutputDirBtn.hidden = !outputDir;
}

document.getElementById('choose-output-dir').addEventListener('click', async () => {
  const dir = await window.electronAPI.selectOutputFolder();
  if (dir) setOutputDir(dir);
});

resetOutputDirBtn.addEventListener('click', () => setOutputDir(''));

function isSupported(file) {
  return SUPPORTED_EXTENSIONS.includes(file.name.toLowerCase().split('.').pop());
}

// Shared settings refresh whichever tab is showing.
function onSettingsChange() {
  if (activeTab === 'crop') scheduleCropPreview();
  else schedulePreview();
}

qualitySlider.addEventListener('input', (e) => {
  qualityValue.textContent = e.target.value;
  onSettingsChange();
});

targetKbInput.addEventListener('input', () => {
  qualityLabel.textContent = targetKbInput.value ? 'Max quality' : 'Quality';
  onSettingsChange();
});

[maxWidthInput, maxHeightInput].forEach(input => input.addEventListener('input', onSettingsChange));

// Tabs
let activeTab = 'batch';
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
    document.getElementById('batch-panel').hidden = activeTab !== 'batch';
    document.getElementById('crop-panel').hidden = activeTab !== 'crop';
    onSettingsChange();
  });
});

// ---------- Batch tab ----------

// Click to browse - use main process dialog to get full paths
dropZone.addEventListener('click', async () => {
  const paths = await window.electronAPI.selectFiles();
  if (paths.length > 0) {
    selectedFilePaths = paths;
    displayFiles();
    convertBtn.disabled = false;
  }
});

// Drag and drop
setupDropZone(dropZone, (files) => {
  selectedFilePaths = files.map(f => window.electronAPI.getPathForFile(f)).filter(Boolean);
  displayFiles();
  convertBtn.disabled = selectedFilePaths.length === 0;
});

// Convert button
convertBtn.addEventListener('click', async () => {
  if (selectedFilePaths.length === 0) return;

  clearTimeout(previewTimer);
  previewRequest++;
  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting...';
  results.innerHTML = '';

  try {
    const conversionResults = await window.electronAPI.convertImages(selectedFilePaths, getOptions());

    displayResults(conversionResults);
  } catch (error) {
    results.innerHTML = `<div class="result-item error">
      <div class="error-message">Error: ${escapeHtml(error.message)}</div>
    </div>`;
  }

  convertBtn.disabled = selectedFilePaths.length === 0;
  convertBtn.textContent = 'Convert to WebP';
});

// Clear button
clearBtn.addEventListener('click', () => {
  clearTimeout(previewTimer);
  previewRequest++;
  selectedFilePaths = [];
  fileList.innerHTML = '';
  results.innerHTML = '';
  convertBtn.disabled = true;
  clearBtn.style.display = 'none';
});

function displayFiles() {
  fileList.innerHTML = '';

  selectedFilePaths.forEach(filePath => {
    const name = filePath.split(/[\\/]/).pop();
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `
      <span class="file-name">${escapeHtml(name)}</span>
      <span class="file-info">Estimating...</span>
    `;
    fileList.appendChild(div);
  });

  clearBtn.style.display = selectedFilePaths.length > 0 ? 'inline-block' : 'none';
  schedulePreview(0);
}

function schedulePreview(delay = 400) {
  clearTimeout(previewTimer);
  if (selectedFilePaths.length === 0) return;
  previewTimer = setTimeout(runPreview, delay);
}

async function runPreview() {
  const requestId = ++previewRequest;
  const infoEls = fileList.querySelectorAll('.file-info');
  infoEls.forEach(el => { el.textContent = 'Estimating...'; });

  let previews;
  try {
    previews = await window.electronAPI.previewImages(selectedFilePaths, getOptions());
  } catch (error) {
    previews = null;
  }

  // A newer preview or a conversion has started since; its results win.
  if (!previews || requestId !== previewRequest) return;

  previews.forEach((preview, i) => {
    if (infoEls[i]) infoEls[i].innerHTML = describePreview(preview);
  });
}

function describePreview(p) {
  if (!p.success) return `<span class="error-message">${escapeHtml(p.error)}</span>`;

  const change = percentChange(p.originalSize, p.newSize);
  const larger = p.newSize > p.originalSize ? ' larger' : '';
  return `${describeDimensions(p)} | ${formatBytes(p.originalSize)} &rarr; ` +
    `<span class="estimate${larger}">~${formatBytes(p.newSize)} (${change})</span>` +
    describeQuality(p);
}

function describeDimensions(r) {
  return r.outWidth !== r.width || r.outHeight !== r.height
    ? `${r.width}&times;${r.height} &rarr; ${r.outWidth}&times;${r.outHeight}`
    : `${r.width}&times;${r.height}`;
}

function describeQuality(r) {
  if (r.hitTarget === false) return ` | <span class="flag">&#9888; target not reachable (quality ${r.quality})</span>`;
  return ` | quality ${r.quality}`;
}

function percentChange(before, after) {
  const pct = ((after - before) / before * 100).toFixed(1);
  return after <= before ? `${Math.abs(pct)}% smaller` : `+${pct}% larger`;
}

function displayResults(conversionResults) {
  results.innerHTML = '<h3 style="margin-bottom: 16px;">Conversion Results</h3>';

  conversionResults.forEach(result => {
    const div = document.createElement('div');
    div.className = `result-item ${result.success ? '' : 'error'}`;

    if (result.success) {
      div.innerHTML = `
        <div class="result-header">
          <span>&#10003; ${escapeHtml(result.original)}</span>
          <span class="savings">${percentChange(result.originalSize, result.newSize)}</span>
        </div>
        <div class="result-details">
          ${formatBytes(result.originalSize)} &rarr; ${formatBytes(result.newSize)} | ${describeDimensions(result)}${describeQuality(result)} | Saved as ${escapeHtml(result.output)}
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="result-header">
          <span>&#10007; ${escapeHtml(result.original)}</span>
        </div>
        <div class="error-message">${escapeHtml(result.error)}</div>
      `;
    }

    results.appendChild(div);
  });
}

// ---------- Crop tab ----------

const cropDropZone = document.getElementById('crop-drop-zone');
const cropEditor = document.getElementById('crop-editor');
const cropImage = document.getElementById('crop-image');
const cropResult = document.getElementById('crop-result');
const cropResultStage = document.getElementById('crop-result-stage');
const cropRatio = document.getElementById('crop-ratio');
const cropExactWidth = document.getElementById('crop-exact-width');
const cropExactHeight = document.getElementById('crop-exact-height');
const cropInfo = document.getElementById('crop-info');
const cropSaveBtn = document.getElementById('crop-save');
const cropStatus = document.getElementById('crop-status');

let cropper = null;
let cropFile = null; // { path, name, originalSize, width, height, displayWidth }
let cropTimer = null;
let cropRequest = 0;

cropDropZone.addEventListener('click', openCropFileDialog);
document.getElementById('crop-clear').addEventListener('click', clearCrop);
setupDropZone(cropDropZone, (files) => loadCropFile(window.electronAPI.getPathForFile(files[0])));

async function openCropFileDialog() {
  const paths = await window.electronAPI.selectFiles(false);
  if (paths.length > 0) loadCropFile(paths[0]);
}

// Back to the empty crop tab with the upload box.
function clearCrop() {
  clearTimeout(cropTimer);
  cropRequest++;
  if (cropper) cropper.destroy();
  cropper = null;
  cropFile = null;
  cropImage.removeAttribute('src');
  cropResult.removeAttribute('src');
  cropInfo.textContent = '';
  cropStatus.innerHTML = '';
  cropSaveBtn.disabled = true;
  cropEditor.hidden = true;
  cropDropZone.hidden = false;
}

async function loadCropFile(filePath) {
  if (!filePath) return;
  cropSaveBtn.disabled = true;
  cropStatus.innerHTML = '';
  cropInfo.textContent = 'Loading...';

  let loaded;
  try {
    loaded = await window.electronAPI.cropLoad(filePath);
  } catch (error) {
    cropInfo.innerHTML = `<span class="error-message">${escapeHtml(error.message)}</span>`;
    return;
  }

  cropFile = loaded;
  document.getElementById('crop-file-name').textContent =
    `${loaded.name} (${loaded.width}×${loaded.height}, ${formatBytes(loaded.originalSize)})`;
  cropDropZone.hidden = true;
  cropEditor.hidden = false;
  cropResult.removeAttribute('src');

  if (cropper) cropper.destroy();
  cropImage.src = loaded.displayUrl;
  cropImage.onload = () => {
    cropper = new Cropper(cropImage, {
      viewMode: 1,
      autoCropArea: 1,
      aspectRatio: currentRatio(),
      zoomable: false,
      movable: false,
      rotatable: false,
      scalable: false,
      ready: () => {
        // Save works straight away: it encodes from the current crop, not from the preview.
        cropSaveBtn.disabled = false;
        scheduleCropPreview(0);
      },
      crop: () => scheduleCropPreview()
    });
  };
}

// ---------- Crop presets ----------
// A preset is a ratio (locks the crop box shape only) or an exact size (shape + output size).
// Saved per PC in localStorage, which survives app updates.

const PRESETS_KEY = 'cropPresets';
const DEFAULT_PRESETS = [
  { name: '', width: 1, height: 1, type: 'ratio' },
  { name: '', width: 4, height: 3, type: 'ratio' },
  { name: '', width: 3, height: 2, type: 'ratio' },
  { name: '', width: 16, height: 9, type: 'ratio' },
  { name: '', width: 3, height: 4, type: 'ratio' },
  { name: '', width: 2, height: 3, type: 'ratio' },
  { name: '', width: 9, height: 16, type: 'ratio' },
  { name: 'Hero banner', width: 2560, height: 1100, type: 'exact' },
  { name: 'Social share', width: 1200, height: 630, type: 'exact' }
];

let presets = loadPresets();
let lastPresetValue = 'free';

function withIds(list) {
  return list.map(p => ({ ...p, id: p.id || crypto.randomUUID() }));
}

function loadPresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESETS_KEY));
    if (Array.isArray(saved)) return withIds(saved);
  } catch (error) {
    // Fall through to defaults.
  }
  return withIds(DEFAULT_PRESETS);
}

function savePresets(list) {
  presets = list;
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch (error) {
    // Used this session even if it can't be stored.
  }
}

function presetLabel(p) {
  const size = p.type === 'ratio' ? `${p.width}:${p.height}` : `${p.width}×${p.height}`;
  return p.name ? `${p.name} (${size})` : size;
}

function findPreset(value) {
  return value.startsWith('p:') ? presets.find(p => `p:${p.id}` === value) : null;
}

function addOption(parent, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  parent.appendChild(option);
}

function renderPresetOptions() {
  const previous = cropRatio.value || lastPresetValue;
  cropRatio.innerHTML = '';
  addOption(cropRatio, 'free', 'Free');
  addOption(cropRatio, 'original', 'Original');

  const ratios = document.createElement('optgroup');
  ratios.label = 'Ratios';
  const exacts = document.createElement('optgroup');
  exacts.label = 'Exact sizes';
  presets.forEach(p => addOption(p.type === 'ratio' ? ratios : exacts, `p:${p.id}`, presetLabel(p)));
  addOption(exacts, 'custom', 'Custom size (type below)');
  if (ratios.children.length) cropRatio.appendChild(ratios);
  cropRatio.appendChild(exacts);

  addOption(cropRatio, 'edit', 'Edit presets…');

  const stillExists = [...cropRatio.options].some(o => o.value === previous && previous !== 'edit');
  cropRatio.value = stillExists ? previous : 'free';
  lastPresetValue = cropRatio.value;
  renderPresetChips();
}

// One-click buttons mirroring the dropdown (Free, Original, then every preset).
function renderPresetChips() {
  const chips = document.getElementById('preset-chips');
  chips.innerHTML = '';
  const choices = [
    { value: 'free', label: 'Free', kind: 'ratio' },
    { value: 'original', label: 'Original', kind: 'ratio' },
    ...presets.map(p => ({ value: `p:${p.id}`, label: presetLabel(p), kind: p.type }))
  ];
  choices.forEach(choice => {
    const chip = document.createElement('button');
    chip.className = `preset-chip ${choice.kind}`;
    chip.dataset.value = choice.value;
    chip.textContent = choice.label;
    chip.addEventListener('click', () => {
      cropRatio.value = choice.value;
      cropRatio.dispatchEvent(new Event('change'));
    });
    chips.appendChild(chip);
  });
  updatePresetChips();
}

function updatePresetChips() {
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.value === cropRatio.value);
  });
}

function getExactSize() {
  const width = parseInt(cropExactWidth.value, 10);
  const height = parseInt(cropExactHeight.value, 10);
  return width > 0 && height > 0 ? { width, height } : null;
}

// The exact size boxes win; otherwise the selected ratio (or Free) applies.
function currentRatio() {
  const exact = getExactSize();
  if (exact) return exact.width / exact.height;
  if (cropRatio.value === 'original') return cropFile ? cropFile.width / cropFile.height : NaN;
  const preset = findPreset(cropRatio.value);
  return preset && preset.type === 'ratio' ? preset.width / preset.height : NaN;
}

function applyCropShape() {
  if (cropper) cropper.setAspectRatio(currentRatio());
  scheduleCropPreview();
}

cropRatio.addEventListener('change', () => {
  const value = cropRatio.value;
  if (value === 'edit') {
    cropRatio.value = lastPresetValue;
    openPresetDialog();
    return;
  }
  lastPresetValue = value;
  updatePresetChips();

  const preset = findPreset(value);
  if (preset && preset.type === 'exact') {
    cropExactWidth.value = preset.width;
    cropExactHeight.value = preset.height;
  } else if (value === 'custom') {
    cropExactWidth.focus();
  } else {
    cropExactWidth.value = '';
    cropExactHeight.value = '';
  }
  applyCropShape();
});

// Typing a size selects the matching exact preset, or "Custom size".
function syncPresetToExactSize() {
  const exact = getExactSize();
  const selected = findPreset(cropRatio.value);
  if (exact) {
    const match = presets.find(p => p.type === 'exact' && p.width === exact.width && p.height === exact.height);
    cropRatio.value = match ? `p:${match.id}` : 'custom';
  } else if (cropRatio.value === 'custom' || (selected && selected.type === 'exact')) {
    cropRatio.value = 'free';
  }
  lastPresetValue = cropRatio.value;
  updatePresetChips();
}

[cropExactWidth, cropExactHeight].forEach(input => input.addEventListener('input', () => {
  syncPresetToExactSize();
  applyCropShape();
}));

// ---------- Preset editor ----------

const presetDialog = document.getElementById('preset-dialog');
const presetRows = document.getElementById('preset-rows');
const presetError = document.getElementById('preset-error');

function addPresetRow(p = { name: '', width: '', height: '', type: 'exact' }, isNew = false) {
  const row = document.createElement('div');
  row.className = 'preset-row';
  row.dataset.id = p.id || '';
  row.innerHTML = `
    <input type="text" class="preset-name">
    <input type="number" class="preset-width" min="1" step="1">
    <input type="number" class="preset-height" min="1" step="1">
    <select class="preset-type">
      <option value="ratio">Ratio</option>
      <option value="exact">Exact size</option>
    </select>
    <button class="preset-delete" title="Delete">&times;</button>
  `;
  row.querySelector('.preset-name').value = p.name;
  // Only new rows get the example name, so existing unnamed ratios stay uncluttered.
  if (isNew) row.querySelector('.preset-name').placeholder = 'e.g. Blog header';
  row.querySelector('.preset-width').value = p.width;
  row.querySelector('.preset-height').value = p.height;
  row.querySelector('.preset-type').value = p.type;
  row.querySelector('.preset-delete').addEventListener('click', () => row.remove());
  presetRows.appendChild(row);
  return row;
}

function openPresetDialog() {
  presetRows.innerHTML = '';
  presetError.hidden = true;
  presets.forEach(p => addPresetRow(p));
  presetDialog.showModal();
}

document.getElementById('preset-add').addEventListener('click', () => {
  const row = addPresetRow(undefined, true);
  row.scrollIntoView({ block: 'nearest' });
  row.querySelector('.preset-name').focus();
});

document.getElementById('preset-restore').addEventListener('click', () => {
  presetRows.innerHTML = '';
  presetError.hidden = true;
  DEFAULT_PRESETS.forEach(p => addPresetRow(p));
});

document.getElementById('preset-cancel').addEventListener('click', () => presetDialog.close());

document.getElementById('preset-save').addEventListener('click', () => {
  const list = [];
  let valid = true;

  presetRows.querySelectorAll('.preset-row').forEach(row => {
    const widthInput = row.querySelector('.preset-width');
    const heightInput = row.querySelector('.preset-height');
    const width = parseInt(widthInput.value, 10);
    const height = parseInt(heightInput.value, 10);
    widthInput.classList.toggle('invalid', !(width > 0));
    heightInput.classList.toggle('invalid', !(height > 0));
    if (!(width > 0 && height > 0)) {
      valid = false;
      return;
    }
    list.push({
      id: row.dataset.id || crypto.randomUUID(),
      name: row.querySelector('.preset-name').value.trim(),
      width,
      height,
      type: row.querySelector('.preset-type').value
    });
  });

  if (!valid) {
    presetError.textContent = 'Every preset needs a whole-number width and height above 0.';
    presetError.hidden = false;
    return;
  }

  savePresets(list);
  renderPresetOptions();
  syncPresetToExactSize();
  applyCropShape();
  presetDialog.close();
});

renderPresetOptions();

document.getElementById('crop-reset').addEventListener('click', () => {
  if (!cropper) return;
  cropper.reset();
  cropper.setAspectRatio(currentRatio());
});

document.getElementById('crop-actual-size').addEventListener('change', (e) => {
  cropResultStage.classList.toggle('actual', e.target.checked);
});

// Crop box in full-resolution pixels (the editor shows a downscaled copy).
function getCropOptions() {
  const data = cropper.getData(true);
  const scale = cropFile.width / cropFile.displayWidth;
  const exact = getExactSize();
  return {
    ...getOptions(),
    exactWidth: exact ? exact.width : null,
    exactHeight: exact ? exact.height : null,
    crop: {
      left: data.x * scale,
      top: data.y * scale,
      width: data.width * scale,
      height: data.height * scale
    }
  };
}

function scheduleCropPreview(delay = 350) {
  clearTimeout(cropTimer);
  if (!cropper || !cropFile) return;
  cropTimer = setTimeout(runCropPreview, delay);
}

async function runCropPreview() {
  const requestId = ++cropRequest;
  cropInfo.textContent = 'Compressing preview...';

  let preview;
  try {
    preview = await window.electronAPI.cropPreview(cropFile.path, getCropOptions());
  } catch (error) {
    if (requestId === cropRequest) {
      cropInfo.innerHTML = `<span class="error-message">${escapeHtml(error.message)}</span>`;
    }
    return;
  }

  if (!preview || requestId !== cropRequest) return;

  cropResult.src = preview.dataUrl;
  cropInfo.innerHTML = `Crop ${describeDimensions(preview)} | ` +
    `${formatBytes(preview.originalSize)} &rarr; <span class="savings">${formatBytes(preview.newSize)}</span>` +
    describeQuality(preview);
  if (preview.enlargeBlocked) {
    const exact = getExactSize();
    const imageFits = cropFile.width >= exact.width && cropFile.height >= exact.height;
    const advice = imageFits
      ? 'Drag the crop box larger to reach the full size.'
      : (() => {
        const s = Math.min(cropFile.width / exact.width, cropFile.height / exact.height);
        return `This image is only ${cropFile.width}&times;${cropFile.height}, so the most this shape can reach is ` +
          `${Math.round(exact.width * s)}&times;${Math.round(exact.height * s)} with the crop box at full size.`;
      })();
    cropInfo.innerHTML += `<br><span class="flag">&#9888; The selected area is smaller than ` +
      `${exact.width}&times;${exact.height}, so it will be saved at ${preview.outWidth}&times;${preview.outHeight} ` +
      `(same shape, not enlarged). ${advice}</span>`;
  }
}

cropSaveBtn.addEventListener('click', async () => {
  if (!cropper || !cropFile) return;
  cropSaveBtn.disabled = true;
  cropSaveBtn.textContent = 'Saving...';

  try {
    const saved = await window.electronAPI.cropSave(cropFile.path, getCropOptions());
    cropStatus.innerHTML = `<div class="result-item">
      <div class="result-header"><span>&#10003; Saved as ${escapeHtml(saved.output)}</span>
      <span class="savings">${formatBytes(saved.newSize)}</span></div>
      <div class="result-details">${escapeHtml(saved.outputPath)}</div>
    </div>`;
  } catch (error) {
    cropStatus.innerHTML = `<div class="result-item error">
      <div class="error-message">Error: ${escapeHtml(error.message)}</div>
    </div>`;
  }

  cropSaveBtn.disabled = false;
  cropSaveBtn.textContent = 'Save as WebP';
});

// ---------- Shared helpers ----------

function setupDropZone(zone, onFiles) {
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(isSupported);
    if (files.length > 0) onFiles(files);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
