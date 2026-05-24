
import React, { useState, useContext, useEffect, useCallback } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { AppContext } from '../context/AppContext';
import type { Project, Spreadsheet, SpreadsheetColumn, SpreadsheetRow } from '../types';
import Button from './ui/Button';
import Icon from './Icon';
import Input from './ui/Input';

interface SpreadsheetViewProps {
    project: Project;
}

const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({ project }) => {
    const { t } = useTranslation();
    const { updateProject, deepLinkTarget } = useContext(AppContext);
    
    const initialSpreadsheets: Spreadsheet[] = project.spreadsheets || (project.spreadsheetData ? [{
        id: 'sheet-legacy',
        title: project.spreadsheetData.name || 'Untitled Table',
        columns: project.spreadsheetData.columns,
        rows: project.spreadsheetData.rows,
        createdAt: new Date().toISOString()
    }] : []);

    const initialSheetId = (deepLinkTarget && typeof deepLinkTarget === 'object' && deepLinkTarget.view === 'spreadsheet') ? deepLinkTarget.id : null;

    const [selectedSheet, setSelectedSheet] = useState<Spreadsheet | null>(() => {
        if (initialSheetId) {
            return initialSpreadsheets.find(s => s.id === initialSheetId) || null;
        }
        return initialSpreadsheets.length > 0 ? initialSpreadsheets[0] : null;
    });

    const [localSpreadsheets, setLocalSpreadsheets] = useState<Spreadsheet[]>(initialSpreadsheets);
    
    useEffect(() => {
        const currentSheets = project.spreadsheets || (project.spreadsheetData ? [{
             id: 'sheet-legacy',
             title: project.spreadsheetData.name || 'Untitled Table',
             columns: project.spreadsheetData.columns,
             rows: project.spreadsheetData.rows,
             createdAt: new Date().toISOString()
        }] : []);
        
        setLocalSpreadsheets(currentSheets);

        if (selectedSheet) {
            const updated = currentSheets.find(s => s.id === selectedSheet.id);
            if (updated) {
                if (JSON.stringify(updated) !== JSON.stringify(selectedSheet)) {
                    setSelectedSheet(updated);
                }
            } else {
                setSelectedSheet(currentSheets.length > 0 ? currentSheets[0] : null);
            }
        } else if (currentSheets.length > 0) {
             setSelectedSheet(currentSheets[0]);
        }
    }, [project.spreadsheets, project.spreadsheetData]);

    const updateProjectSpreadsheets = (newSpreadsheets: Spreadsheet[]) => {
        updateProject(project.id, { spreadsheets: newSpreadsheets });
    };

    const handleNewTable = () => {
        const newSheet: Spreadsheet = {
            id: `sheet-${Date.now()}`,
            title: `Nueva Tabla ${localSpreadsheets.length + 1}`,
            columns: [
                { id: `col-1-${Date.now()}`, name: 'Nombre / Artículo' }, 
                { id: `col-2-${Date.now()}`, name: 'Precio / Costo' },
                { id: `col-3-${Date.now()}`, name: 'Stock / Cantidad' },
                { id: `col-4-${Date.now()}`, name: 'Categoría' }
            ],
            rows: [],
            createdAt: new Date().toISOString()
        };
        const updated = [...localSpreadsheets, newSheet];
        setLocalSpreadsheets(updated); 
        updateProjectSpreadsheets(updated);
        setSelectedSheet(newSheet);
    };

    const handleDeleteTable = (id: string) => {
        if (!window.confirm('¿Estás seguro de que quieres eliminar esta tabla?')) return;
        const updated = localSpreadsheets.filter(s => s.id !== id);
        setLocalSpreadsheets(updated);
        updateProjectSpreadsheets(updated);
        if (selectedSheet?.id === id) {
            setSelectedSheet(updated.length > 0 ? updated[0] : null);
        }
    };

    const handleRenameTable = (id: string, newName: string) => {
        const updated = localSpreadsheets.map(s => s.id === id ? { ...s, title: newName } : s);
        setLocalSpreadsheets(updated);
        updateProjectSpreadsheets(updated);
        if (selectedSheet?.id === id) {
            setSelectedSheet({ ...selectedSheet, title: newName });
        }
    };

    const handleCellChange = (rowIndex: number, cellIndex: number, value: string) => {
        if (!selectedSheet) return;
        const newRows = [...selectedSheet.rows];
        if (!newRows[rowIndex]) return;
        
        const newCells = [...newRows[rowIndex].cells];
        newCells[cellIndex] = { ...newCells[cellIndex], value };
        newRows[rowIndex] = { ...newRows[rowIndex], cells: newCells };
        
        const updatedSheet = { ...selectedSheet, rows: newRows };
        setSelectedSheet(updatedSheet);
        
        const updatedSheets = localSpreadsheets.map(s => s.id === selectedSheet.id ? updatedSheet : s);
        updateProjectSpreadsheets(updatedSheets);
    };

    const handleColumnNameChange = (colIndex: number, name: string) => {
        if (!selectedSheet) return;
        const newCols = [...selectedSheet.columns];
        newCols[colIndex] = { ...newCols[colIndex], name };
        
        const updatedSheet = { ...selectedSheet, columns: newCols };
        setSelectedSheet(updatedSheet);
        
        const updatedSheets = localSpreadsheets.map(s => s.id === selectedSheet.id ? updatedSheet : s);
        updateProjectSpreadsheets(updatedSheets);
    };

    const addColumn = () => {
        if (!selectedSheet) return;
        const newColId = `col-${Date.now()}`;
        const newCol: SpreadsheetColumn = { id: newColId, name: `Columna ${selectedSheet.columns.length + 1}` };
        
        const newRows = selectedSheet.rows.map(row => ({
            ...row,
            cells: [...row.cells, { id: `cell-${Date.now()}-${row.id}`, value: '' }]
        }));
        
        const updatedSheet = { ...selectedSheet, columns: [...selectedSheet.columns, newCol], rows: newRows };
        setSelectedSheet(updatedSheet);
        
        const updatedSheets = localSpreadsheets.map(s => s.id === selectedSheet.id ? updatedSheet : s);
        updateProjectSpreadsheets(updatedSheets);
    };

    const addRow = () => {
        if (!selectedSheet) return;
        const newRow: SpreadsheetRow = {
            id: `row-${Date.now()}`,
            cells: selectedSheet.columns.map(col => ({ id: `cell-${Date.now()}-${col.id}`, value: '' }))
        };
        
        const updatedSheet = { ...selectedSheet, rows: [...selectedSheet.rows, newRow] };
        setSelectedSheet(updatedSheet);
        
        const updatedSheets = localSpreadsheets.map(s => s.id === selectedSheet.id ? updatedSheet : s);
        updateProjectSpreadsheets(updatedSheets);
    };

    const deleteColumn = (colIndex: number) => {
        if (!selectedSheet || selectedSheet.columns.length <= 1) return;
        if (!window.confirm('¿Eliminar esta columna?')) return;

        const newCols = selectedSheet.columns.filter((_, i) => i !== colIndex);
        const newRows = selectedSheet.rows.map(row => ({
            ...row,
            cells: row.cells.filter((_, i) => i !== colIndex)
        }));

        const updatedSheet = { ...selectedSheet, columns: newCols, rows: newRows };
        setSelectedSheet(updatedSheet);
        const updatedSheets = localSpreadsheets.map(s => s.id === selectedSheet.id ? updatedSheet : s);
        updateProjectSpreadsheets(updatedSheets);
    };

    const deleteRow = (rowIndex: number) => {
        if (!selectedSheet) return;
        if (!window.confirm('¿Eliminar esta fila?')) return;

        const newRows = selectedSheet.rows.filter((_, i) => i !== rowIndex);
        const updatedSheet = { ...selectedSheet, rows: newRows };
        setSelectedSheet(updatedSheet);
        const updatedSheets = localSpreadsheets.map(s => s.id === selectedSheet.id ? updatedSheet : s);
        updateProjectSpreadsheets(updatedSheets);
    };

    return (
        <div className="h-full min-h-[500px] flex flex-col md:flex-row gap-6 animate-fade-in bg-neutral-100 dark:bg-neutral-900 p-4 rounded-lg">
            {/* Sidebar List */}
            <div className={`
                ${selectedSheet ? 'hidden' : 'flex'} md:flex 
                w-full md:w-1/3 md:max-w-xs flex-col bg-light-surface dark:bg-dark-surface 
                rounded-xl shadow-sm p-0 overflow-hidden h-48 md:h-full
            `}>
                <div className="p-4 border-b border-light-border dark:border-dark-border">
                    <Button onClick={handleNewTable} variant="primary" className="w-full">
                        <Icon name="plus" className="w-4 h-4"/> Nueva Tabla
                    </Button>
                </div>
                {localSpreadsheets.length > 0 ? (
                    <ul className="flex-1 overflow-y-auto">
                        {localSpreadsheets.map(sheet => (
                            <li key={sheet.id}>
                                <button 
                                    onClick={() => setSelectedSheet(sheet)} 
                                    className={`w-full text-left p-4 hover:bg-black/5 dark:hover:bg-white/5 border-b border-light-border dark:border-dark-border last:border-0 ${selectedSheet?.id === sheet.id ? 'bg-brand-accent/20 border-l-4 border-l-brand-primary' : ''}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Icon name="table" className="w-4 h-4 text-neutral-500" />
                                        <p className="font-semibold truncate text-sm">{sheet.title}</p>
                                    </div>
                                    <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary mt-1 pl-6">
                                        {new Date(sheet.createdAt).toLocaleDateString()}
                                    </p>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-center p-4">
                        <div>
                            <Icon name="table" className="w-16 h-16 mx-auto text-neutral-400" />
                            <p className="mt-4 text-lg text-light-text-secondary dark:text-dark-text-secondary">No hay tablas en este proyecto.</p>
                            <Button onClick={handleNewTable} variant="primary" className="mt-4">Crear primera tabla</Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Editor Area */}
            <div className={`
                ${selectedSheet ? 'flex' : 'hidden'} md:flex 
                flex-1 flex-col h-full overflow-hidden bg-white dark:bg-dark-surface rounded-xl shadow-lg relative
            `}>
                {selectedSheet ? (
                    <>
                        {/* Toolbar / Header */}
                        <div className="flex-shrink-0 p-4 border-b border-light-border dark:border-dark-border flex flex-col sm:flex-row sm:items-center gap-4 bg-white/50 dark:bg-dark-surface/50 backdrop-blur-sm">
                             <div className="flex items-center gap-2 flex-grow">
                                <Button variant="ghost" size="sm" className="!p-2 md:hidden text-neutral-900 dark:text-white" onClick={() => setSelectedSheet(null)} title="Atrás">
                                    <Icon name="chevronDown" className="w-5 h-5 transform rotate-90"/>
                                </Button>
                                <div className="flex-grow">
                                    <Input 
                                        value={selectedSheet.title} 
                                        onChange={(e) => handleRenameTable(selectedSheet.id, e.target.value)}
                                        className="text-xl font-bold !p-1 !border-transparent focus:!border-light-border dark:focus:!border-dark-border hover:!border-light-border dark:hover:!border-dark-border !bg-transparent !mt-0 w-full"
                                    />
                                </div>
                             </div>
                             
                             <div className="flex items-center gap-2 flex-wrap justify-end">
                                <Button onClick={addRow} variant="secondary" size="sm"><Icon name="plus" className="w-4 h-4" /> Fila</Button>
                                <Button onClick={addColumn} variant="secondary" size="sm"><Icon name="plus" className="w-4 h-4" /> Columna</Button>
                                <div className="h-6 border-l border-light-border dark:border-dark-border mx-1"></div>
                                <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-500/10 !p-2" onClick={() => handleDeleteTable(selectedSheet.id)} title="Eliminar Tabla">
                                    <Icon name="trash" className="w-5 h-5"/>
                                </Button>
                             </div>
                        </div>

                        {/* Table Container */}
                        <div className="flex-1 overflow-auto p-4 bg-white dark:bg-dark-surface">
                            <div className="border border-light-border dark:border-dark-border rounded-lg overflow-hidden inline-block min-w-full shadow-sm">
                                <table className="w-full border-collapse">
                                    <thead className="bg-light-bg dark:bg-dark-bg sticky top-0 z-10">
                                        <tr>
                                            <th className="p-2 border-r border-b border-light-border dark:border-dark-border font-semibold text-sm w-12 text-center text-neutral-500 bg-neutral-100 dark:bg-neutral-800">#</th>
                                            {selectedSheet.columns.map((col, colIndex) => (
                                                <th key={col.id} className="p-0 border-r border-b border-light-border dark:border-dark-border font-semibold text-sm min-w-[150px] relative group">
                                                    <div className="flex items-center">
                                                        <input
                                                            value={col.name}
                                                            onChange={(e) => handleColumnNameChange(colIndex, e.target.value)}
                                                            className="w-full bg-transparent p-2 font-bold text-center focus:outline-none focus:bg-brand-accent/10 transition-colors"
                                                        />
                                                        <button 
                                                            onClick={() => deleteColumn(colIndex)}
                                                            className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Eliminar columna"
                                                        >
                                                            <Icon name="close" className="w-3 h-3"/>
                                                        </button>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="p-2 border-b border-light-border dark:border-dark-border w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedSheet.rows.map((row, rowIndex) => (
                                            <tr key={row.id} className="group hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                                                <td className="p-2 border-r border-b border-light-border dark:border-dark-border text-center text-sm bg-neutral-50 dark:bg-neutral-800 text-neutral-500 font-mono">{rowIndex + 1}</td>
                                                {row.cells.map((cell, cellIndex) => (
                                                    <td key={cell.id} className="p-0 border-r border-b border-light-border dark:border-dark-border min-w-[150px]">
                                                        <input
                                                            value={cell.value}
                                                            onChange={(e) => handleCellChange(rowIndex, cellIndex, e.target.value)}
                                                            className="w-full h-full p-2 bg-transparent border-none focus:ring-2 focus:ring-inset focus:ring-brand-primary focus:bg-white dark:focus:bg-black/20 text-sm"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="p-0 border-b border-light-border dark:border-dark-border text-center">
                                                     <button 
                                                        onClick={() => deleteRow(rowIndex)}
                                                        className="p-1.5 text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Eliminar fila"
                                                    >
                                                        <Icon name="trash" className="w-4 h-4"/>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {selectedSheet.rows.length === 0 && (
                                            <tr>
                                                <td colSpan={selectedSheet.columns.length + 2} className="p-8 text-center text-neutral-400 italic text-sm">
                                                    La tabla está vacía. Añade filas para empezar.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="flex-shrink-0 p-2 border-t border-light-border dark:border-dark-border text-right bg-neutral-50 dark:bg-dark-bg text-xs text-neutral-500">
                            {selectedSheet.rows.length} filas x {selectedSheet.columns.length} columnas
                        </div>
                    </>
                ) : (
                    <div className="hidden md:flex flex-1 items-center justify-center text-center">
                        <div>
                            <Icon name="table" className="w-16 h-16 mx-auto text-neutral-400" />
                            {localSpreadsheets.length > 0 ? (
                                <p className="mt-4 text-lg text-light-text-secondary dark:text-dark-text-secondary">Selecciona una tabla para ver o editar.</p>
                            ) : (
                                <>
                                    <p className="mt-4 text-lg text-light-text-secondary dark:text-dark-text-secondary">No hay tablas aún.</p>
                                    <Button onClick={handleNewTable} variant="primary" className="mt-4">Crear Primera Tabla</Button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SpreadsheetView;
