# 📚 Guías y Libros de Goatify

Las guías de los 16 libros están ahora guardadas de manera permanente, separadas en dos archivos para preservar la calidad, longitud, y evitar problemas de límite de los archivos. Fueron escritas como "guías profundas" con estrategias letales de monetización, links de LinkedIn, y sin contenido repetido.

## 📂 ¿Dónde están guardadas?
- **Primeros 8 libros:** `data/books.ts`
- **Siguientes 8 libros:** `data/books_part2.ts`

*(Ambos archivos se unen automáticamente y se muestran en la aplicación).*

## ✍️ ¿Cómo agregar nuevas guías o libros en el futuro?

Solo debes abrir el archivo `data/books_part2.ts` (o crear un `data/books_part3.ts` si prefieres el orden) y agregar un nuevo bloque de objeto al arreglo. 

La estructura a seguir es esta:

```typescript
    { 
        id: 'book-17', 
        title: "Título Original del Libro", 
        author: "Autor Original", 
        spanishTitle: "Ingeniería de [Tu Título Asombroso en Español]",
        description: "Una pequeña descripción agresiva y directa del libro.",
        coverUrl: '', // Puedes dejarlo vacío
        summary: "Resumen corto de una frase impactante.",
        content: \`
### SUBTÍTULO ÚNICO DE ESTA GUÍA
Acá va tu texto en formato Markdown de múltiples párrafos. Muy detallado y único para enseñar la lección del libro.

### VÍAS DE MONETIZACIÓN O APLICACIÓN
- **Idea 1:** Cómo aplicarlo en consultoría.
- **Idea 2:** Cómo generar dinero web.

---
**Autor de la Guía:** Daniel Ortega (o Victor Ortega)
**Perfil:** [LinkedIn](https://www.linkedin.com/in/danielortegac/)  
**Lectura recomendada:** Título Original - Autor Original\`
    }
```

## 🔄 Acerca de Firebase / Base de Datos
He dejado preparadas las reglas en `firestore.rules` (colección \`books\`) por si en algún momento deseas construir un CMS (Panel de Administrador) para subirlos todos a Firebase y dejar de depender de los archivos locales. Si deseas que migre todos estos archivos de \`data/books.ts\` a Firebase directamente y cree un Panel para que los edites desde la vista web de la App como Super Admin, por favor dímelo y lo estructuraremos. Por ahora, están sólidos e inquebrantables en el código, 100% seguros y estáticos.
