
import React from 'react';
import type { Project, Task } from '../types';
import { TaskStatus } from '../types';
import { useTranslation } from '../hooks/useTranslation';

interface TableViewProps {
    project: Project;
    tasks: Task[];
    onUpdateTask: (task: Task) => void;
    onTaskClick: (task: Task) => void;
}

const TableView: React.FC<TableViewProps> = ({ project, tasks, onUpdateTask, onTaskClick }) => {
    const { t } = useTranslation();

    const handleStatusChange = (task: Task, newStatus: string) => {
        onUpdateTask({ ...task, status: newStatus });
    };

    const getStatusColor = (status: string) => {
        const fixedStatus = project.statuses.find(s => s.name === status);
        if (fixedStatus) return fixedStatus.color;
        
        switch (status) {
            case TaskStatus.TODO: return '#FBBF24';
            case TaskStatus.IN_PROGRESS: return '#3B82F6';
            case TaskStatus.DONE: return '#10B981';
            default: return '#9CA3AF'; 
        }
    };

    return (
        <div className="bg-light-surface dark:bg-dark-surface p-1 sm:p-4 rounded-xl sm:rounded-2xl shadow-md overflow-x-auto">
            <table className="w-full text-left table-auto">
                <thead className="border-b border-light-border dark:border-dark-border text-[9px] sm:text-sm">
                    <tr>
                        <th className="p-1 sm:p-3 font-semibold">Status</th>
                        <th className="p-1 sm:p-3 font-semibold">{t('taskTitle')}</th>
                        <th className="p-1 sm:p-3 font-semibold hidden sm:table-cell">{t('folder')}</th>
                        <th className="p-1 sm:p-3 font-semibold">{t('taskDate')}</th>
                        <th className="p-1 sm:p-3 font-semibold hidden md:table-cell">{t('taskTags')}</th>
                        <th className="p-1 sm:p-3 font-semibold text-center">{t('taskHours')}</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:border-dark-border text-[9px] sm:text-sm">
                    {tasks.map(task => (
                         <tr key={task.id} onClick={() => onTaskClick(task)} className="hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                            <td className="p-1 sm:p-3" onClick={e => e.stopPropagation()}>
                                <select 
                                    value={task.status} 
                                    onChange={(e) => handleStatusChange(task, e.target.value)} 
                                    style={{
                                        backgroundColor: `${getStatusColor(task.status)}33`, 
                                        color: getStatusColor(task.status)
                                    }}
                                    className={`text-[8px] sm:text-sm font-semibold px-1 py-0.5 sm:px-2 sm:py-1 rounded-full border-none focus:ring-0 bg-opacity-20 max-w-[70px] sm:max-w-none truncate`}
                                >
                                    {project.statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                </select>
                            </td>
                            <td className="p-1 sm:p-3 font-medium max-w-[80px] sm:max-w-xs truncate">{task.title}</td>
                            <td className="p-1 sm:p-3 text-xs hidden sm:table-cell max-w-[80px] truncate">{project.folders.find(f => f.id === task.folderId)?.name}</td>
                            <td className="p-1 sm:p-3 whitespace-nowrap">{new Date(task.date).toLocaleDateString()}</td>
                            <td className="p-1 sm:p-3 hidden md:table-cell">
                                <div className="flex gap-1 flex-wrap">
                                    {task.tags?.slice(0, 2).map(tag => (
                                        <span key={tag} className="text-[8px] sm:text-xs bg-brand-accent/50 text-brand-primary font-semibold px-1.5 py-0.5 rounded-full truncate max-w-[60px]">{tag}</span>
                                    ))}
                                </div>
                            </td>
                            <td className="p-1 sm:p-3 font-bold text-center">{task.hours ? `${task.hours}h` : '-'}</td>
                         </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default TableView;
