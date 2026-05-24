
import React, { useState, useContext } from 'react';
import { AppContext } from '../context/AppContext';
import { Book } from '../types';
import Icon from './Icon';
import Button from './ui/Button';
import Input from './ui/Input';
import Textarea from './ui/Textarea';
import Modal from './ui/Modal';
import Spinner from './ui/Spinner';

export const BookManagement: React.FC = () => {
    const { allBooks, addBook, updateBook, deleteBook, seedBooks, setToastNotification } = useContext(AppContext);
    const [isEditing, setIsEditing] = useState<Book | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleSeed = async () => {
        if (!window.confirm('¿Quieres pasar todas las guías maestras (16) a Firebase? Esto permitirá editarlas en tiempo real.')) return;
        setIsSeeding(true);
        await seedBooks();
        setIsSeeding(false);
    };
    
    const [formData, setFormData] = useState<Omit<Book, 'id'>>({
        title: '',
        spanishTitle: '',
        author: '',
        description: '',
        coverUrl: '',
        summary: '',
        content: '',
        sourceUrl: ''
    });

    const handleSave = async () => {
        if (!formData.title || !formData.author || !formData.content) {
            setToastNotification({ title: "Campos Incompletos", message: "Título, autor y contenido son obligatorios.", icon: "warning" });
            return;
        }

        if (isEditing) {
            await updateBook(isEditing.id, formData);
            setIsEditing(null);
        } else {
            await addBook(formData);
            setIsAdding(false);
        }
        
        setFormData({
            title: '',
            spanishTitle: '',
            author: '',
            description: '',
            coverUrl: '',
            summary: '',
            content: '',
            sourceUrl: ''
        });
    };

    const handleEdit = (book: Book) => {
        setIsEditing(book);
        setFormData({
            title: book.title,
            spanishTitle: book.spanishTitle || '',
            author: book.author,
            description: book.description,
            coverUrl: book.coverUrl || '',
            summary: book.summary,
            content: book.content,
            sourceUrl: book.sourceUrl || ''
        });
    };

    const filteredBooks = allBooks.filter(b => 
        b.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        b.author.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center gap-4">
                <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                        <Icon name="search" className="w-4 h-4"/>
                    </div>
                    <Input 
                        value={searchTerm} 
                        onChange={e => setSearchTerm(e.target.value)} 
                        placeholder="Buscar guía por título o autor..." 
                        className="pl-10" 
                    />
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={handleSeed} disabled={isSeeding} className="flex items-center gap-2 border-amber-200 text-amber-700 hover:bg-amber-50">
                        {isSeeding ? <Spinner size="sm"/> : <Icon name="send" className="w-4 h-4"/>} 
                        Sincronizar Maestras
                    </Button>
                    <Button onClick={() => setIsAdding(true)} className="flex items-center gap-2">
                        <Icon name="plus" className="w-4 h-4"/> Nueva Guía
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar border border-neutral-200 dark:border-neutral-800 rounded-2xl bg-white dark:bg-neutral-950 shadow-inner">
                <table className="w-full text-xs text-left border-collapse min-w-[800px]">
                    <thead className="bg-neutral-100 dark:bg-neutral-900 sticky top-0 z-20 shadow-sm border-b dark:border-neutral-800">
                        <tr className="font-black uppercase tracking-widest text-neutral-400">
                            <th className="p-4">Libro</th>
                            <th className="p-4">Autor</th>
                            <th className="p-4">Descripción</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-neutral-900">
                        {filteredBooks.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center text-neutral-500 italic">
                                    No se encontraron guías.
                                </td>
                            </tr>
                        ) : filteredBooks.map((book) => (
                            <tr key={book.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50 transition-colors group">
                                <td className="p-4">
                                    <div className="font-black text-neutral-900 dark:text-white">{book.title}</div>
                                    <div className="text-[10px] text-neutral-500">{book.spanishTitle}</div>
                                </td>
                                <td className="p-4 font-bold text-brand-primary">{book.author}</td>
                                <td className="p-4 max-w-xs truncate text-neutral-500">{book.description}</td>
                                <td className="p-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => handleEdit(book)}
                                            className="p-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                            title="Editar Guía"
                                        >
                                            <Icon name="edit" className="w-3.5 h-3.5"/>
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if (window.confirm('¿Estás seguro de eliminar esta guía?')) {
                                                    deleteBook(book.id);
                                                }
                                            }}
                                            className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                            title="Eliminar Guía"
                                        >
                                            <Icon name="trash" className="w-3.5 h-3.5"/>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Modal 
                isOpen={isAdding || !!isEditing} 
                onClose={() => { setIsAdding(false); setIsEditing(null); }}
                title={isEditing ? 'Editar Guía' : 'Nueva Guía de Libro'}
                className="max-w-4xl"
            >
                <div className="space-y-4 max-h-[70vh] overflow-y-auto px-1 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Título Original</label>
                            <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ej: Atomic Habits" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Título en Español (Marketing)</label>
                            <Input value={formData.spanishTitle} onChange={e => setFormData({...formData, spanishTitle: e.target.value})} placeholder="Ej: Hábitos Atómicos" />
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Autor del Libro</label>
                            <Input value={formData.author} onChange={e => setFormData({...formData, author: e.target.value})} placeholder="Ej: James Clear" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Imagen de Portada (URL)</label>
                            <Input value={formData.coverUrl} onChange={e => setFormData({...formData, coverUrl: e.target.value})} placeholder="https://..." />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Descripción Corta</label>
                        <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={2} placeholder="De qué trata el libro..." />
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Resumen Ejecutivo</label>
                        <Textarea value={formData.summary} onChange={e => setFormData({...formData, summary: e.target.value})} rows={2} placeholder="Resumen en una frase..." />
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Contenido de la Guía (Markdown)</label>
                        <Textarea 
                            value={formData.content} 
                            onChange={e => setFormData({...formData, content: e.target.value})} 
                            rows={12} 
                            placeholder="Desarrollo completo de la guía..."
                            className="font-mono text-xs"
                        />
                        <p className="text-[9px] text-neutral-400 mt-1 italic">Usa Markdown para títulos (###), listas y negritas.</p>
                    </div>

                    <div>
                        <label className="text-[10px] font-black text-neutral-500 uppercase mb-1 block">Fuente / Lectura Recomendada</label>
                        <Input value={formData.sourceUrl} onChange={e => setFormData({...formData, sourceUrl: e.target.value})} placeholder="Ej: Título del libro - Autor" />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-6 border-t dark:border-neutral-800">
                    <Button variant="secondary" onClick={() => { setIsAdding(false); setIsEditing(null); }}>Cancelar</Button>
                    <Button onClick={handleSave} className="px-8">
                        {isEditing ? 'Guardar Cambios' : 'Crear Guía'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};
