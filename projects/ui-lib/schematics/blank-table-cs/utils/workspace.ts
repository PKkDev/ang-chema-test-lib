import { SchematicsException, Tree, DirEntry } from '@angular-devkit/schematics';
import { virtualFs, workspaces } from '@angular-devkit/core';
import * as ts from 'typescript';

export async function getWorkspace(tree: Tree, path = '/') {
    const host = createHost(tree);

    const { workspace } = await workspaces.readWorkspace(path, host);

    return workspace;
}

function createHost(tree: Tree): workspaces.WorkspaceHost {
    return {
        async readFile(path: string): Promise<string> {
            const data = tree.read(path);
            if (!data) {
                throw new SchematicsException('Файл не найден');
            }
            return virtualFs.fileBufferToString(data);
        },
        async writeFile(path: string, data: string): Promise<void> {
            return tree.overwrite(path, data);
        },
        async isDirectory(path: string): Promise<boolean> {
            return !tree.exists(path) && tree.getDir(path).subfiles.length > 0;
        },
        async isFile(path: string): Promise<boolean> {
            return tree.exists(path);
        },
    };
}

export function findModule(tree: Tree, rootStr: string, module: string): string | undefined {
    const root: DirEntry = tree.getDir(rootStr);
    if (!root) throw new SchematicsException(`Ошибка получения узла '${rootStr}'`);

    for (const file of root.subfiles) {
        if (file.includes(module)) {
            return `${rootStr}/${file}`;
        }
    }

    for (const dir of root.subdirs) {
        return findModule(tree, `${rootStr}/${dir}`, module);
    }

    return undefined;
}

export function getSourceNodes(sourceFile: ts.SourceFile): ts.Node[] {
    const nodes: ts.Node[] = [sourceFile];
    const result = [];

    while (nodes.length > 0) {
        const node = nodes.shift();

        if (node) {
            result.push(node);
            if (node.getChildCount(sourceFile) >= 0) {
                nodes.unshift(...node.getChildren());
            }
        }
    }

    return result;
}