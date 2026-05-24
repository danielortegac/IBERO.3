import React, { useState } from 'react';
import Icon from '../Icon';
import Button from './Button';

interface CodeBlockProps {
    code: string;
    language: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([code], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'index.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handlePreview = () => {
        const previewWindow = window.open('', '_blank');
        if (previewWindow) {
            previewWindow.document.write(code);
            previewWindow.document.close();
        }
    };

    const isHtml = language.toLowerCase() === 'html';

    return (
        <div className="bg-gray-900 rounded-lg my-2 relative group text-left h-full">
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {isHtml && (
                    <>
                        <Button onClick={handlePreview} size="sm" variant="secondary" className="!p-1.5 h-auto" title="Preview in new tab">
                            <Icon name="externalLink" className="w-4 h-4" />
                        </Button>
                        <Button onClick={handleDownload} size="sm" variant="secondary" className="!p-1.5 h-auto" title="Download HTML">
                            <Icon name="upload" className="w-4 h-4" />
                        </Button>
                    </>
                )}
                <Button onClick={handleCopy} size="sm" variant="secondary" className="!p-1.5 h-auto" title="Copy Code">
                    <Icon name={copied ? 'check' : 'copy'} className="w-4 h-4" />
                </Button>
            </div>
            <pre className="p-4 pt-10 overflow-auto text-sm text-white h-full">
                <code>{code}</code>
            </pre>
        </div>
    );
};

export default CodeBlock;