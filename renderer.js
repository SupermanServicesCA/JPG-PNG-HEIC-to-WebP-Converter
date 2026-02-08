let selectedFilePaths = [];

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const convertBtn = document.getElementById('convert-btn');
const clearBtn = document.getElementById('clear-btn');
const results = document.getElementById('results');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('quality-value');

// Quality slider
qualitySlider.addEventListener('input', (e) => {
  qualityValue.textContent = e.target.value;
});

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
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(file => {
    const ext = file.name.toLowerCase().split('.').pop();
    return file.type === 'image/jpeg' || file.type === 'image/png' ||
           file.type === 'image/heic' || file.type === 'image/heif' ||
           ext === 'heic' || ext === 'heif';
  });
  if (files.length > 0) {
    selectedFilePaths = files.map(f => window.electronAPI.getPathForFile(f)).filter(Boolean);
    displayFiles();
    convertBtn.disabled = selectedFilePaths.length === 0;
  }
});

// Convert button
convertBtn.addEventListener('click', async () => {
  if (selectedFilePaths.length === 0) return;

  convertBtn.disabled = true;
  convertBtn.textContent = 'Converting...';
  results.innerHTML = '';

  const quality = qualitySlider.value;

  try {
    const conversionResults = await window.electronAPI.convertImages(selectedFilePaths, quality);

    displayResults(conversionResults);
  } catch (error) {
    results.innerHTML = `<div class="result-item error">
      <div class="error-message">Error: ${error.message}</div>
    </div>`;
  }

  convertBtn.disabled = selectedFilePaths.length === 0;
  convertBtn.textContent = 'Convert to WebP';
});

// Clear button
clearBtn.addEventListener('click', () => {
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
    div.innerHTML = `<span class="file-name">${name}</span>`;
    fileList.appendChild(div);
  });

  clearBtn.style.display = selectedFilePaths.length > 0 ? 'inline-block' : 'none';
}

function displayResults(conversionResults) {
  results.innerHTML = '<h3 style="margin-bottom: 16px;">Conversion Results</h3>';

  conversionResults.forEach(result => {
    const div = document.createElement('div');
    div.className = `result-item ${result.success ? '' : 'error'}`;

    if (result.success) {
      div.innerHTML = `
        <div class="result-header">
          <span>&#10003; ${result.original}</span>
          <span class="savings">${result.savings}% smaller</span>
        </div>
        <div class="result-details">
          ${result.originalSize} &rarr; ${result.newSize} | Saved as ${result.output}
        </div>
      `;
    } else {
      div.innerHTML = `
        <div class="result-header">
          <span>&#10007; ${result.original}</span>
        </div>
        <div class="error-message">${result.error}</div>
      `;
    }

    results.appendChild(div);
  });
}
