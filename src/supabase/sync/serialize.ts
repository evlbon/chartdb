import { diagramSchema, type Diagram } from '@/lib/domain/diagram';

// Сериализация для облака/live-ops со СТАБИЛЬНЫМИ id.
//
// Штатные diagramToJSONOutput/diagramFromJSONInput намеренно клонируют
// диаграмму с новыми id (это нужно для экспорта в файл и шаблонов), но для
// синхронизации это яд: у каждого клиента свои id одних и тех же сущностей,
// и адресные live-операции (updateTable(id) и т.п.) перестают сходиться.
// Здесь id сохраняются как есть; Date-поля есть только на верхнем уровне
// (diagram.createdAt/updatedAt), вложенные сущности используют number.

export const diagramToContent = (diagram: Diagram): object =>
    JSON.parse(JSON.stringify(diagram));

export const diagramFromContent = (content: unknown): Diagram => {
    const raw = content as { createdAt?: string; updatedAt?: string };

    return diagramSchema.parse({
        ...(content as object),
        createdAt: raw.createdAt ? new Date(raw.createdAt) : new Date(),
        updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : new Date(),
    });
};
