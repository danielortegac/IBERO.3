
/**
 * PROCESADOR DE MARKDOWN A HTML PARA EL NOTEPAD - ACTUALIZADO A MORADO
 */
export const formatMarkdownToHtmlForNotepad = (text: string) => {
    return text
        .replace(/^# (.*$)/gim, '<h1 style="color: #4c1d95; font-weight: 900; font-size: 2.2rem; margin-top: 1.5rem; border-left: 6px solid #4c1d95; padding-left: 15px;">$1</h1>')
        .replace(/^## (.*$)/gim, '<h2 style="color: #4c1d95; font-weight: 800; font-size: 1.8rem; margin-top: 1.2rem; border-bottom: 2px solid rgba(76, 29, 149, 0.15); padding-bottom: 5px;">$1</h2>')
        .replace(/^### (.*$)/gim, '<h3 style="color: #4c1d95; font-weight: 700; font-size: 1.4rem; margin-top: 1rem;">$1</h3>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/\n/gim, '<br>');
};
