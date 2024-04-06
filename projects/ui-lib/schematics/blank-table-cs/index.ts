import { Rule, SchematicContext, SchematicsException, Tree, apply, url, applyTemplates, move, mergeWith, Source, UpdateRecorder, MergeStrategy, chain } from '@angular-devkit/schematics';
import { strings, normalize } from '@angular-devkit/core';
import { dasherize, classify } from '@angular-devkit/core/src/utils/strings';

import { IBlankTableCsOptions } from './model/blank-table-cs-options';
import { ITableProperty } from './model/itable-property';
import { parseCsFile, getModelName } from './mapping/charp-mapping';
import { getWorkspace, findModule, getSourceNodes } from './utils/workspace';

import { addDeclarationToModule } from '@schematics/angular/utility/ast-utils';
import { InsertChange } from '@schematics/angular/utility/change';

import * as ts from 'typescript';

export function blankTableCs(options: IBlankTableCsOptions): Rule {
    return async (tree: Tree, context: SchematicContext) => {

        context.logger.info('options.project ' + options.project);

        options.modelName = getModelName(options.csfile);
        // const iMappedModelName = 'IMapped' + modelName;
        // console.log('modelName: ', modelName);

        const workspace = await getWorkspace(tree);

        const project = workspace.projects.get(options.project as string);
        if (!project) throw new SchematicsException(`Проект не найден: ${options.project}`);

        if (options.path === undefined) {
            const projectType = project.extensions['projectType'] === 'application' ? 'app' : 'lib';
            options.path = `${project.sourceRoot}/${projectType}`;
        }
        options.pathWithFolder = options.path + `/${dasherize(options.name)}`; // add folder
        if (options.module === undefined) {
            options.module = 'app.module';
        }

        const modulePath = findModule(tree, project.sourceRoot!, options.module);
        if (!modulePath) throw new SchematicsException(`Не удалось найти модуль '${options.module}'`);
        console.log('modulePath', modulePath);

        // console.log('project', project);
        console.log('options.path', options.path, 'options.pathWithFolder', options.pathWithFolder);

        const tableProperty = parseCsFile(context, options);

        const source: Source = url('./files');
        const templateSource = apply(source, [
            applyTemplates({
                classify: strings.classify,
                dasherize: strings.dasherize,
                name: options.name,
                modelName: options.modelName,
            }),
            move(normalize(options.pathWithFolder))
        ]);

        return chain([
            mergeWith(templateSource, MergeStrategy.Overwrite),
            updateDataService(options, tableProperty),
            updateCmpConstants(options, tableProperty),
            updateNgModule(options, modulePath),
            createDto(options, tableProperty)
        ]);
    }
}

export function updateDataService(options: IBlankTableCsOptions, tableProperty: ITableProperty[]): Rule {
    return (tree: Tree, context: SchematicContext) => {
        const fileName = `${dasherize(options.name)}-data.service.ts`
        context.logger.info(`Обновление файла '${fileName}'`);

        const filePath = options.pathWithFolder + `/${fileName}`;
        const buffer = tree.read(filePath);
        if (!buffer) throw new SchematicsException(`Файл ${filePath} не найден`);

        const source = ts.createSourceFile(filePath, buffer.toString(), ts.ScriptTarget.Latest, true);
        const nodes = getSourceNodes(source);

        const returnKeyword = nodes.find(n => n.kind === ts.SyntaxKind.ReturnKeyword);
        if (!returnKeyword) throw new SchematicsException(`не найден ReturnKeyword`);

        const updateRecorder: UpdateRecorder = tree.beginUpdate(filePath);
        updateRecorder.insertRight(returnKeyword.pos, `\n`);
        for (const iterator of tableProperty) {
            const str = `stringIndexerHelper.addColumnItem(new ColumnItemStrict('${iterator.title}', '${iterator.name}', null, '${iterator.name}', null, null));`
            updateRecorder.insertRight(returnKeyword.pos, `\n\t\t${str}`);
        }
        tree.commitUpdate(updateRecorder);

        return tree;
    };
}

export function updateCmpConstants(options: IBlankTableCsOptions, tableProperty: ITableProperty[]): Rule {
    return (tree: Tree, context: SchematicContext) => {
        const fileName = `${dasherize(options.name)}.component.constants.ts`
        context.logger.info(`Обновление файла '${fileName}'`);

        const filePath = options.pathWithFolder + `/${fileName}`;
        const buffer = tree.read(filePath);
        if (!buffer) throw new SchematicsException(`Файл ${filePath} не найден`);

        const source = ts.createSourceFile(filePath, buffer.toString(), ts.ScriptTarget.Latest, true);
        const nodes = getSourceNodes(source);
        // nodes.forEach(x => console.log(x.kind + ' - ' + x.getText()));

        const arrowFunction = nodes.find(n => n.kind === ts.SyntaxKind.ArrowFunction);
        if (!arrowFunction) throw new SchematicsException(`Не найден ArrowFunction`);

        const block = arrowFunction.getChildren().find(n => n.kind === ts.SyntaxKind.Block);
        if (!block) throw new SchematicsException(`Не найден Block`);

        const openBraceToken = block.getChildren().find(n => n.kind === ts.SyntaxKind.OpenBraceToken);
        if (!openBraceToken) throw new SchematicsException(`Не найден OpenBraceToken`);

        const updateRecorder: UpdateRecorder = tree.beginUpdate(filePath);
        updateRecorder.insertRight(openBraceToken.end, `\n`);
        updateRecorder.insertRight(openBraceToken.end, `\treturn {`);
        for (const iterator of tableProperty) {
            let str = `${iterator.name}: dto.${iterator.name},`;
            switch (iterator.dataType) {
                case 'DateTime':
                    str = `${iterator.name}: dto.${iterator.name} ? formatDate(dto.${iterator.name}, 'dd.MM.yyyy', 'ru') : '',`
                    break;
                default:
                    break;
            }

            updateRecorder.insertRight(openBraceToken.end, `\n\t\t${str}`);
        }
        updateRecorder.insertRight(openBraceToken.end, `\n\t}`);
        tree.commitUpdate(updateRecorder);

        return tree;
    };
}

export function updateNgModule(options: IBlankTableCsOptions, modulePath: string): Rule {
    return (tree: Tree, context: SchematicContext) => {

        context.logger.info(`Обновление файла '${modulePath}' ${options.name}`);

        const buffer = tree.read(modulePath);
        if (!buffer) throw new SchematicsException(`Файл ${modulePath} не найден`);
        const source = ts.createSourceFile(modulePath, buffer.toString(), ts.ScriptTarget.Latest, true);

        const updateRecorder = tree.beginUpdate(modulePath);

        const componentClass = `${classify(options.name)}Component`
        const componentPath = options.pathWithFolder + `/${dasherize(options.name)}.component`;

        const changes = addDeclarationToModule(
            source,
            modulePath,
            componentClass,
            componentPath
        ) as InsertChange[];

        for (const change of changes) {
            if (change instanceof InsertChange) {
                updateRecorder.insertLeft(change.pos, change.toAdd);
            }
        }

        tree.commitUpdate(updateRecorder);

        return tree;
    };
}

export function createDto(options: IBlankTableCsOptions, tableProperty: ITableProperty[]): Rule {
    return (tree: Tree, context: SchematicContext) => {

        context.logger.info(`Обновление файла '${dasherize(options.modelName)}.ts'`);
        const pathtoDto = options.pathWithFolder + '/' + dasherize(options.modelName) + '.ts';
        if (tree.exists(pathtoDto)) tree.delete(pathtoDto);
        tree.create(pathtoDto, '');
        const updateRecorder: UpdateRecorder = tree.beginUpdate(pathtoDto);
        updateRecorder.insertLeft(0, `export interface ${options.modelName} {`);
        for (const iterator of tableProperty) {
            updateRecorder.insertLeft(0, `\n\t${iterator.name}: ${iterator.dataType == 'DateTime' ? 'string' : iterator.dataType}`);
        }
        updateRecorder.insertLeft(0, `\n}`);
        tree.commitUpdate(updateRecorder);

        return tree;
    };
}
