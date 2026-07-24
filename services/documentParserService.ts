
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';

// Set workerSrc for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://aistudiocdn.com/pdfjs-dist@^4.4.168/build/pdf.worker.mjs`;

async function parseTxt(buffer: Uint8Array): Promise<string> {
    return new TextDecoder().decode(buffer);
}

async function parsePdf(buffer: Uint8Array): Promise<string> {
    const data = buffer;
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let textContent = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        textContent += content.items.map(item => 'str' in item ? item.str : '').join(' ') + '\n';
    }
    return textContent;
}

async function parseDocx(buffer: Uint8Array): Promise<string> {
    // Fix: Cast to unknown then ArrayBuffer to bypass "ArrayBufferLike" type mismatch error
    const arrayBuffer = buffer.buffer as unknown as ArrayBuffer;
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
}

async function parseXlsx(buffer: Uint8Array): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    // Fix: Cast to unknown then ArrayBuffer to bypass "ArrayBufferLike" type mismatch error
    const arrayBuffer = buffer.buffer as unknown as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
    let textContent = '';
    workbook.eachSheet((worksheet) => {
        worksheet.eachRow((row) => {
            row.eachCell((cell) => {
                if (cell.value) {
                    textContent += cell.text + ' ';
                }
            });
            textContent += '\n';
        });
    });
    return textContent;
}

async function parsePptx(buffer: Uint8Array): Promise<string> {
    const zip = await JSZip.loadAsync(buffer);
    const slidePromises: Promise<string>[] = [];
    zip.folder('ppt/slides')?.forEach((relativePath, file) => {
        if (relativePath.endsWith('.xml')) {
            slidePromises.push(file.async('string'));
        }
    });

    const slideXmls = await Promise.all(slidePromises);
    return slideXmls.map(xml => {
        return xml.replace(/<a:t>([^<]+)<\/a:t>/g, '$1 ')
                  .replace(/<[^>]+>/g, '')
                  .trim();
    }).join('\n\n');
}

async function parseCsv(buffer: Uint8Array): Promise<string> {
    const text = new TextDecoder().decode(buffer);
    // Simple CSV parsing: treat each line as a sentence/record
    return text.split('\n').map(line => line.trim()).filter(line => line.length > 0).join('\n');
}

export const parseDocument = async (fileName: string, content: Uint8Array): Promise<string> => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'txt':
            return parseTxt(content);
        case 'pdf':
            return parsePdf(content);
        case 'docx':
            return parseDocx(content);
        case 'xlsx':
            return parseXlsx(content);
        case 'pptx':
            return parsePptx(content);
        case 'csv':
            return parseCsv(content);
        default:
            throw new Error(`지원되지 않는 파일 형식입니다: .${extension}`);
    }
};
