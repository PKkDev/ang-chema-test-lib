import { SchematicsException, SchematicContext } from "@angular-devkit/schematics";

import { readFileSync, existsSync } from 'fs'

import { IAttribute } from "../model/iattribute";
import { IProperty } from "../model/iproperty";
import { ITableProperty } from "../model/itable-property";
import { ParsingState } from "../model/parsing-state";
import { IBlankTableCsOptions } from "../model/blank-table-cs-options";

export function getModelName(csfile: string) {
    const regex = /\/?[aA0-zZ9]*.cs/gm;
    const matches = regex.exec(csfile);

    if (!matches) throw new SchematicsException(`Не удалось определить название модели для ${csfile}`);

    let modelname = matches[0];
    modelname = modelname.substring(0, modelname.length - 3);

    if (modelname.startsWith('/'))
        modelname = modelname.substring(1, modelname.length);

    return modelname;
}

export function parseCsFile(context: SchematicContext, options: IBlankTableCsOptions): ITableProperty[] {

    context.logger.info('Начало обработки файла');

    if (!existsSync(options.csfile))
        throw new SchematicsException(`Файл '${options.csfile}' не найден`);

    const file = readFileSync(options.csfile);

    if (file == null)
        throw new SchematicsException(`Не удалось прочитать файл '${options.csfile}'`);

    const result = mapCharpFile(file.toString());

    // context.logger.info(`найдено ${result.length} свойств`);
    // for (const iterator of result) {
    //     context.logger.info(`result: ${iterator.name}: ${iterator.dataType} + title: ${iterator.title}`);
    // }

    context.logger.info('Файл обработан');

    return result;
}

function mapCharpFile(fileStr: string): ITableProperty[] {

    let arr = fileStr.split('\n');
    arr = arr.map(x => {
        let n = x
        n = n.replace('{ get; set; }', '');
        n = n.replace('{get; set;}', '');
        n = n.trim();
        return n;
    });
    arr = arr.filter(x =>
        !x.includes('using')
        && !x.includes('namespace')
        && !x.includes('public class')
        && /\S/.test(x)
        && x.replace(/{/, '').length
        && x.replace(/}/, '').length);

    let lastAttrinute: IAttribute | null = null;
    let lastProperty: IProperty | null = null;
    const result: ITableProperty[] = [];

    let inProcess = true;
    let index = 0;
    while (inProcess) {
        if (index >= arr.length) {
            inProcess = false;
            break;
        }

        const str = arr[index];
        // context.logger.info('строка - ' + str);

        const activeState: ParsingState = str.startsWith('[')
            ? ParsingState.Attribute
            : str.startsWith('public')
                ? ParsingState.Property
                : ParsingState.Unknown

        switch (activeState) {
            case ParsingState.Attribute: {
                const map: IAttribute = mapAtribute(str);
                lastAttrinute = map;
                break;
            }
            case ParsingState.Property: {
                const map: IProperty = mapProperty(str);
                lastProperty = map;

                if (lastAttrinute == null)
                    throw new SchematicsException(`Для '${str}' не найден атрибут`);

                result.push({
                    name: lastProperty.name,
                    dataType: lastProperty.dataType,
                    title: lastAttrinute.title
                })

                break;
            }
            case ParsingState.Unknown:
            default: {
                throw new SchematicsException(`Неизвестная конструкция - '${str}'`);
            }
        }

        index++;
    }

    return result;
}

export function mapProperty(propStr: string): IProperty {
    const arr = propStr.split(' ');

    const type = arr[1];
    const name = arr[2];

    let mappedType = 'string';
    switch (type.trim()) {
        case 'long':
        case 'long?':
        case 'int':
        case 'int?': mappedType = 'number'; break;
        case 'string':
        case 'string?': mappedType = 'string'; break;
        case 'bool':
        case 'bool?': mappedType = 'boolean'; break;
        case 'DateTime':
        case 'DateTime?': mappedType = 'DateTime'; break;
    }

    let mappedName = name[0].toLowerCase() + name.substring(1, name.length);

    const res: IProperty = {
        dataType: mappedType,
        name: mappedName
    }
    return res;
}

export function mapAtribute(propStr: string): IAttribute {

    let title = '__not_found_';

    const regExp = /Column\("(.*)"\)/gm;

    const matches = regExp.exec(propStr);
    if (matches != null) {
        matches.forEach((match, groupIndex) => {
            if (groupIndex == 1) {
                title = match;
            }
        })
    }

    const res: IAttribute = {
        title: title
    }
    return res;
}