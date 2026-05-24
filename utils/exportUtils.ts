
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import ExcelJS from 'exceljs';

/**
 * Centrally manages exports for Goatify AI
 */

export const exportToCSV = (data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    // Use BOM for Excel compatibility
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => 
        Object.values(row).map(val => {
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(',')
    ).join('\n');
    
    const csvContent = headers + '\n' + rows;
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8' });
    saveAs(blob, `${filename}.csv`);
};

export const exportToExcel = async (data: any[], filename: string, sheetName: string = 'Datos de Goatify') => {
    if (!data || data.length === 0) return;
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);

    // Get columns from keys
    const columns = Object.keys(data[0]).map(key => ({
        header: key.toUpperCase(),
        key: key,
        width: 20
    }));

    worksheet.columns = columns;

    // Apply some initial styling to headers
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF3B82F6' } // Brand Blue
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data
    data.forEach((item, index) => {
        const row = worksheet.addRow(item);
        // Zebra striping
        if (index % 2 === 0) {
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF9FAFB' }
            };
        }
    });

    // Auto fit columns (simple heuristic)
    worksheet.columns.forEach(column => {
        let maxLength = column.header ? column.header.length : 10;
        data.forEach(row => {
            const value = row[column.key!];
            const length = value ? String(value).length : 0;
            if (length > maxLength) maxLength = length;
        });
        column.width = Math.min(Math.max(maxLength + 2, 12), 40);
    });

    // Write and Save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `${filename}.xlsx`);
};

export const exportComponentAsImage = async (elementId: string, filename: string) => {
    const node = document.getElementById(elementId);
    if (!node) return;
    
    try {
        const dataUrl = await toPng(node, { 
            backgroundColor: '#ffffff',
            cacheBust: true,
            style: {
                borderRadius: '0'
            }
        });
        saveAs(dataUrl, `${filename}.png`);
    } catch (error) {
        console.error('Error exporting image:', error);
    }
};

export const exportComponentAsPDF = async (elementId: string, filename: string, title: string = "Export") => {
    const node = document.getElementById(elementId);
    if (!node) return;
    
    try {
        const dataUrl = await toPng(node, { 
            backgroundColor: '#ffffff',
            cacheBust: true
        });
        
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgProps = pdf.getImageProperties(dataUrl);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
        
        pdf.setFontSize(16);
        pdf.text(title, 10, 10);
        pdf.addImage(dataUrl, 'PNG', 0, 20, pdfWidth, pdfHeight);
        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Error exporting PDF:', error);
    }
};
