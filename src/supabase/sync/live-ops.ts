import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { Note } from '@/lib/domain/note';
import type { Diagram } from '@/lib/domain/diagram';

// Живые правки: каждая мутация хранилища бродкастится в realtime-канал
// диаграммы, получатели применяют её к открытому редактору через действия
// ChartDB-контекста. Персистентность по-прежнему обеспечивает blob-синк
// (debounce-push всей диаграммы) — ops это только «живой» слой.

// Идентификатор ВКЛАДКИ (не пользователя): свои операции отфильтровываются
// по нему, а две вкладки одного пользователя остаются разными участниками.
export const TAB_CLIENT_ID: string = crypto.randomUUID();

interface OpBase {
    clientId: string;
    diagramId: string;
}

export type LiveOp = OpBase &
    (
        | { type: 'updateDiagram'; attributes: Partial<Diagram> }
        | { type: 'deleteDiagram' }
        | { type: 'addTable'; table: DBTable }
        | { type: 'putTable'; table: DBTable }
        | { type: 'updateTable'; id: string; attributes: Partial<DBTable> }
        | { type: 'deleteTable'; id: string }
        | { type: 'deleteDiagramTables' }
        | { type: 'addRelationship'; relationship: DBRelationship }
        | {
              type: 'updateRelationship';
              id: string;
              attributes: Partial<DBRelationship>;
          }
        | { type: 'deleteRelationship'; id: string }
        | { type: 'deleteDiagramRelationships' }
        | { type: 'addDependency'; dependency: DBDependency }
        | {
              type: 'updateDependency';
              id: string;
              attributes: Partial<DBDependency>;
          }
        | { type: 'deleteDependency'; id: string }
        | { type: 'deleteDiagramDependencies' }
        | { type: 'addArea'; area: Area }
        | { type: 'updateArea'; id: string; attributes: Partial<Area> }
        | { type: 'deleteArea'; id: string }
        | { type: 'deleteDiagramAreas' }
        | { type: 'addCustomType'; customType: DBCustomType }
        | {
              type: 'updateCustomType';
              id: string;
              attributes: Partial<DBCustomType>;
          }
        | { type: 'deleteCustomType'; id: string }
        | { type: 'deleteDiagramCustomTypes' }
        | { type: 'addNote'; note: Note }
        | { type: 'updateNote'; id: string; attributes: Partial<Note> }
        | { type: 'deleteNote'; id: string }
        | { type: 'deleteDiagramNotes' }
    );

// Защита от эха: пока применяется чужая операция, storage-bridge не должен
// ни бродкастить её заново, ни планировать blob-push (пушит автор).
// Известное ограничение: флаг накрывает и await'ы внутри применения — если
// пользователь совершит правку в ту же миллисекунду, её live-бродкаст
// потеряется (blob-синк её всё равно доставит при следующей мутации).
let remoteApplyDepth = 0;

export const isRemoteApplyActive = (): boolean => remoteApplyDepth > 0;

export const runWithRemoteApply = async <T>(
    fn: () => Promise<T>
): Promise<T> => {
    remoteApplyDepth += 1;
    try {
        return await fn();
    } finally {
        remoteApplyDepth -= 1;
    }
};
