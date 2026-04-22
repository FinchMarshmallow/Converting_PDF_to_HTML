// Инициализация PDF.js
const pdfjsLib = window['pdfjs-dist/build/pdf'];
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Ждём загрузки DOM, чтобы все элементы были доступны
document.addEventListener('DOMContentLoaded', () => {
	// DOM-элементы
	const dropArea = document.getElementById('drop-area');
	const fileInput = document.getElementById('file-input');
	const resultArea = document.getElementById('result-area');
	const downloadLink = document.getElementById('download-link');

	// Чекбоксы
	const useOcrCheckbox = document.getElementById('use-ocr-checkbox');
	const ocrSuboptions = document.getElementById('ocr-suboptions');
	const includeTxtCheckbox = document.getElementById('include-txt-checkbox');
	const overlayTextCheckbox = document.getElementById('overlay-text-checkbox');

	// Проверка на наличие всех элементов
	if (!dropArea || !fileInput || !resultArea || !downloadLink || !useOcrCheckbox) {
		console.error('Не найдены необходимые DOM-элементы');
		return;
	}

	let parsedPagesData = [];
	let originalFilename = 'document';
	let ocrPerformed = false;

	// Показать/скрыть дополнительные опции
	useOcrCheckbox.addEventListener('change', () => {
		ocrSuboptions.style.display = useOcrCheckbox.checked ? 'block' : 'none';
	});

	// --- Drag & Drop ---
	['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, preventDefaults, false);
	});
	function preventDefaults(e) {
		e.preventDefault();
		e.stopPropagation();
	}
	['dragenter', 'dragover'].forEach(eventName => {
		dropArea.addEventListener(eventName, () => dropArea.classList.add('highlight'), false);
	});
	['dragleave', 'drop'].forEach(eventName => {
		dropArea.addEventListener(eventName, () => dropArea.classList.remove('highlight'), false);
	});
	dropArea.addEventListener('drop', (e) => {
		const files = e.dataTransfer.files;
		if (files.length > 0) {
			handleFiles(files);
		}
	}, false);

	fileInput.addEventListener('change', (e) => {
		if (e.target.files.length > 0) {
			handleFiles(e.target.files);
		}
	}, false);

	function handleFiles(files) {
		if (files.length === 0) return;
		const file = files[0];
		if (file.type !== 'application/pdf') {
			alert('Пожалуйста, выберите PDF-файл.');
			return;
		}
		console.log('Выбран файл:', file.name);
		parsePDF(file);
	}

	// --- Основная функция парсинга ---
	async function parsePDF(file) {
		resultArea.innerHTML = '<p>Обработка PDF, рендеринг страниц...</p>';
		downloadLink.style.display = 'none';
		parsedPagesData = [];
		ocrPerformed = false;
		originalFilename = file.name.replace(/\.pdf$/i, '') || 'converted_document';

		const useOcr = useOcrCheckbox.checked;
		console.log(`Использовать OCR: ${useOcr}`);

		try {
			const arrayBuffer = await file.arrayBuffer();
			const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
			const totalPages = pdf.numPages;
			console.log(`Загружен PDF, страниц: ${totalPages}`);

			for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
				resultArea.innerHTML = `<p>Рендеринг страницы ${pageNum} из ${totalPages}...</p>`;

				const page = await pdf.getPage(pageNum);
				const scale = 2.0; // высокое разрешение
				const viewport = page.getViewport({ scale });

				// Рендерим в canvas
				const canvas = document.createElement('canvas');
				canvas.width = viewport.width;
				canvas.height = viewport.height;
				const ctx = canvas.getContext('2d');
				await page.render({ canvasContext: ctx, viewport: viewport }).promise;
				const imageDataUrl = canvas.toDataURL('image/png');

				let words = [];

				if (useOcr) {
					resultArea.innerHTML = `<p>Распознавание текста на странице ${pageNum} (OCR)...</p>`;
					try {
						const ocrResult = await Tesseract.recognize(
							canvas,
							'rus+eng',
							{
								logger: m => console.log(m),
								tessedit_pageseg_mode: Tesseract.PSM.AUTO,
							}
						);

						words = ocrResult.data.words
							.filter(word => {
								const text = word.text.trim();
								return text.length > 0 &&
									!text.includes('VeryPDF') &&
									!text.includes('verypdf.com') &&
									!text.includes('purchase VeryPDF');
							})
							.map(word => ({
								text: word.text,
								x: word.bbox.x0,
								y: word.bbox.y0,
								width: word.bbox.x1 - word.bbox.x0,
								height: word.bbox.y1 - word.bbox.y0,
								fontSize: Math.round((word.bbox.y1 - word.bbox.y0) * 0.8),
								fontFamily: 'sans-serif',
								confidence: word.confidence
							}));

						ocrPerformed = true;
						console.log(`Страница ${pageNum}: распознано ${words.length} слов`);
					} catch (ocrError) {
						console.error('Ошибка OCR:', ocrError);
						resultArea.innerHTML += `<p style="color: orange;">Предупреждение: не удалось распознать текст на странице ${pageNum}. Продолжаем без текста.</p>`;
						words = [];
					}
				} else {
					console.log(`Страница ${pageNum}: OCR отключён, текст не распознаётся.`);
				}

				parsedPagesData.push({
					pageNum,
					words,
					imageDataUrl,
					width: viewport.width,
					height: viewport.height
				});
			}

			console.log('Обработка завершена, страниц обработано:', parsedPagesData.length);
			displayPreview();
			await prepareDownload();

		} catch (error) {
			console.error('Ошибка:', error);
			resultArea.innerHTML = `<p style="color: red;">Ошибка: ${error.message}</p>`;
		}
	}

	// --- Предпросмотр ---
	function displayPreview() {
		 const overlayText = overlayTextCheckbox.checked;

    if (!parsedPagesData || parsedPagesData.length === 0) {
        resultArea.innerHTML = '<p>Нет данных для предпросмотра.</p>';
        return;
    }

    let previewHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    previewHtml += '<style>';
    previewHtml += `
        body { margin: 0; padding: 20px; background: #f0f0f0; }
        .page-container { 
            position: relative; 
            margin: 0 auto 20px; 
            box-shadow: 0 2px 5px rgba(0,0,0,0.1); 
            background: white; 
            display: inline-block;
        }
        .page-image { 
            display: block; 
            max-width: 100%; 
        }
        .text-layer { 
            position: absolute; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            pointer-events: none;
        }
        .ocr-word { 
            position: absolute; 
            white-space: pre; 
            background-color: rgba(255,255,255,0.8); 
            padding: 0 2px; 
            line-height: 1.2;
            color: black;
            border: 1px solid rgba(0,0,0,0.1);
            pointer-events: auto;
        }
    `;
    previewHtml += '</style></head><body>';

    parsedPagesData.forEach(page => {
        previewHtml += `<div class="page-container" style="width:${page.width}px; height:${page.height}px;">`;
        previewHtml += `<img src="${page.imageDataUrl}" class="page-image" style="width:${page.width}px; height:${page.height}px;" />`;
        
        if (overlayText && page.words.length > 0) {
            previewHtml += `<div class="text-layer">`;
            page.words.forEach(word => {
                const style = `left:${word.x}px; top:${word.y}px; font-size:${word.fontSize}px; font-family:${word.fontFamily};`;
                previewHtml += `<span class="ocr-word" style="${style}">${word.text}</span>`;
            });
            previewHtml += `</div>`;
        }
        previewHtml += `</div>`;
    });
    previewHtml += '</body></html>';

    // Используем существующий iframe или создаём новый с srcdoc для Firefox
    let iframe = document.querySelector('#preview-iframe');
    if (!iframe) {
        resultArea.innerHTML = '<h3>Предпросмотр:</h3>';
        iframe = document.createElement('iframe');
        iframe.id = 'preview-iframe';
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.border = '1px solid #ccc';
        resultArea.appendChild(iframe);
    }
    iframe.srcdoc = previewHtml;
}

// --- Подготовка ZIP (исправлена, не затирает iframe) ---
async function prepareDownload() {
    const overlayText = overlayTextCheckbox.checked;
    const includeTxt = includeTxtCheckbox.checked && ocrPerformed;

    const zip = new JSZip();
    const imgFolder = zip.folder('img');

    let fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">';
    fullHtml += '<link rel="stylesheet" href="style.css"></head><body>';

    let fullText = '';

    for (const page of parsedPagesData) {
        const imgName = `page_${page.pageNum}.png`;
        const imgBlob = await (await fetch(page.imageDataUrl)).blob();
        imgFolder.file(imgName, imgBlob);

        fullHtml += `<div class="page-container" style="width:${page.width}px; height:${page.height}px;">`;
        fullHtml += `<img src="img/${imgName}" class="page-image" style="width:${page.width}px; height:${page.height}px;" />`;

        if (overlayText && page.words.length > 0) {
            fullHtml += `<div class="text-layer">`;
            page.words.forEach(word => {
                const style = `left:${word.x}px; top:${word.y}px; font-size:${word.fontSize}px; font-family:${word.fontFamily};`;
                fullHtml += `<span class="ocr-word" style="${style}">${word.text}</span>`;
            });
            fullHtml += `</div>`;
        }

        fullHtml += `</div>`;

        if (includeTxt) {
            const pageText = page.words.map(w => w.text).join(' ');
            fullText += `=== Страница ${page.pageNum} ===\n${pageText}\n\n`;
        }
    }
    fullHtml += '</body></html>';

    const cssContent = `
        body { margin: 0; padding: 20px; background: #f0f0f0; }
        .page-container { position: relative; margin: 0 auto 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); background: white; }
        .page-image { display: block; width: 100%; }
        .text-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .ocr-word { 
            position: absolute; 
            white-space: pre; 
            background-color: white; 
            padding: 0 2px; 
            line-height: 1.2;
            color: black;
        }
    `;

    zip.file('index.html', fullHtml);
    zip.file('style.css', cssContent);

    if (includeTxt && fullText.length > 0) {
        zip.file('recognized_text.txt', fullText);
    }

    // Добавляем статусное сообщение, не удаляя iframe
    const statusMsg = document.createElement('p');
    statusMsg.textContent = 'Создание ZIP-архива...';
    resultArea.appendChild(statusMsg);

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    downloadLink.href = URL.createObjectURL(zipBlob);
    downloadLink.download = `${originalFilename}_html.zip`;
    downloadLink.style.display = 'inline-block';
    downloadLink.textContent = 'Скачать ZIP с HTML, CSS и изображениями';

    downloadLink.addEventListener('click', () => {
        setTimeout(() => URL.revokeObjectURL(downloadLink.href), 100);
    }, { once: true });

    statusMsg.textContent = '✅ Готово! Нажмите кнопку для скачивания.';
}});