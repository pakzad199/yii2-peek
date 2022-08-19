import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {

	let config = vscode.workspace.getConfiguration('file_peek');
	let activeLanguages = (config.get('activeLanguages') as Array<string>);
	let searchFileExtensions = (config.get('searchFileExtensions') as Array<string>);


	const peekFilter: vscode.DocumentFilter[] = activeLanguages.map((language) => {
		return {
			language: language,
			scheme: 'file'
		};
	});

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(peekFilter,
			new PeekFileDefinitionProvider(searchFileExtensions))
	);

}

// this method is called when your extension is deactivated
export function deactivate() { }


class PeekFileDefinitionProvider implements vscode.DefinitionProvider {
	protected fileSearchExtensions: string[] = [];

	constructor(fileSearchExtensions: string[] = []) {
		this.fileSearchExtensions = fileSearchExtensions;
	}

	getPotentialPaths(lookupPath: string): string[] {
		let potentialPaths: string[] = [lookupPath];

		// Add on list where we just add the file extension directly
		this.fileSearchExtensions.forEach((extStr) => {
			potentialPaths.push(lookupPath + extStr);
		});

		// if we have an extension, then try replacing it.
		let parsedPath = path.parse(lookupPath);
		if (parsedPath.ext !== "") {
			this.fileSearchExtensions.forEach((extStr) => {
				const newPath = path.format({
					base: parsedPath.name + extStr,
					dir: parsedPath.dir,
					ext: extStr,
					name: parsedPath.name,
					root: parsedPath.root
				});
				potentialPaths.push(newPath);
			});
		}

		return potentialPaths;
	}

	getFilePathFromLine(line: vscode.TextLine, word: string): string | undefined {

		let couldBeAddress: string[] = line.text.split(' ').filter((str) => {
			return str.indexOf('\\') >= 0 && str.indexOf(word) >= 0;
		});

		if (couldBeAddress.length !== 0) {
			let addressMatch = couldBeAddress[0].match(`('|").+${word}('|")`);
			let workspaceFolders = vscode.workspace.workspaceFolders;

			if (workspaceFolders && addressMatch) {
				let rootDir = workspaceFolders[0].uri.path;
				let addressWords: string[] = addressMatch[0].split('\\');
				addressWords.forEach((item, index, array) => {
					// remove extra char
					item = item.replace(/[^a-zA-Z]+/g, '');

					// add .php to last item in addressWords
					if (index === array.length - 1) {
						item = item + '.php';
					}
					if (item === 'yii') {
						item = 'vendor/yiisoft/yii2';
					}
					// update rootDir, contain to item to build fullPath file
					rootDir = path.join(rootDir, item);
				});
				return rootDir;
			}
		}
	}

	provideDefinition(document: vscode.TextDocument,
		position: vscode.Position,
		token: vscode.CancellationToken): vscode.Definition | undefined {

		let workingDir = path.dirname(document.fileName);
		let word: string = document.getText(document.getWordRangeAtPosition(position));
		let line = document.lineAt(position);

		// controller name
		let fileName = path.basename(document.fileName, '.php').replace('Controller', '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').
			toLocaleLowerCase().replace(/ /g, '-');

		// generate view path
		let viewPath = path.normalize(workingDir + '/../views/' + fileName);

		// We are looking for strings with filenames
		// - simple hack for now we look for the string with our current word in it on our line
		//   and where our cursor position is inside the string
		let match = line.text.match(`\"(.*?${word}.*?)\"|\'(.*?${word}.*?)\'`);

		if (null !== match) {
			let potentialFname = match[1] || match[2];
			let matchStart = match.index ?? 0;
			let matchEnd = matchStart + potentialFname.length;

			// Verify the match string is at same location as cursor
			if ((position.character >= matchStart) &&
				(position.character <= matchEnd)) {
				// add paths that mabye target file in their
				let fullPaths: string[] = [];
				// console.log('viwPath: ' + viewPath,
				// 'potentialFname: ' + potentialFname, 'workingDir : ' + workingDir);
				fullPaths.push(path.resolve(viewPath, potentialFname));
				fullPaths.push(path.resolve(workingDir, potentialFname));
				
				let filePathFromString = this.getFilePathFromLine(line, word);

				if (filePathFromString !== undefined) {
					fullPaths.push(filePathFromString);
				}

				// Find all potential paths to check and return the first one found
				let potentialFnames: string[] = [];
				fullPaths.forEach((fullPath) => {
					potentialFnames = potentialFnames.concat(this.getPotentialPaths(fullPath));
				});

				let foundFname = potentialFnames.find((fnameFull) => {
					return fs.existsSync(fnameFull);
				});
				if (foundFname !== undefined) {
					return new vscode.Location(vscode.Uri.file(foundFname), new vscode.Position(0, 1));
				}
			}
		}
	}
}