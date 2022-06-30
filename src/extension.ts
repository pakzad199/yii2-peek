import * as vscode from 'vscode';
import * as fs   from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	
	let config = vscode.workspace.getConfiguration('file_peek');
	let active_languages = (config.get('activeLanguages') as Array<string>);
	let search_file_extensions = (config.get('searchFileExtensions') as Array<string>);


	const peek_filter: vscode.DocumentFilter[] = active_languages.map((language) => {
		return {
		   language: language,
		   scheme: 'file'
		};
	 });

	 context.subscriptions.push(
		vscode.languages.registerDefinitionProvider(peek_filter,
					   new PeekFileDefinitionProvider(search_file_extensions))
	 );

}

// this method is called when your extension is deactivated
export function deactivate() {}


class PeekFileDefinitionProvider implements vscode.DefinitionProvider {
	protected fileSearchExtensions: string[] = [];
 
	constructor(fileSearchExtensions: string[] = []) {
	   this.fileSearchExtensions = fileSearchExtensions;
	}
 
	getPotentialPaths(lookupPath: string): string[] 
	{
	   let potential_paths: string[] = [lookupPath];
 
	   // Add on list where we just add the file extension directly
	   this.fileSearchExtensions.forEach((extStr) => {
		  potential_paths.push(lookupPath + extStr);
	   });
 
	   // if we have an extension, then try replacing it.
	   let parsed_path = path.parse(lookupPath);
	   if (parsed_path.ext !== "") {
		  this.fileSearchExtensions.forEach((extStr) => {
			 const new_path = path.format({
				base: parsed_path.name + extStr,
				dir: parsed_path.dir,
				ext: extStr,
				name: parsed_path.name,
				root: parsed_path.root
			 });
			 potential_paths.push(new_path);
		  });
	   }
 
	   return potential_paths;
	}
 
	provideDefinition(document: vscode.TextDocument,
					  position: vscode.Position,
					  token: vscode.CancellationToken): vscode.Definition 
	{
	   // todo: make this method operate async
	   let working_dir = path.dirname(document.fileName);
	   let word = document.getText(document.getWordRangeAtPosition(position));
	   let line = document.lineAt(position);
 
	//    console.log('====== peek-file definition lookup ===========');
	//    console.log('word: ' + word);
	//    console.log('working_dir: ' + working_dir);
	//    console.log('line: ' + line.text);
	//    console.log('document: ' + document.fileName);
	//    console.log('typeof document: ' + document.fileName + '/../');

	   let file_name = path.basename(document.fileName, '.php').replace('Controller', '').toLowerCase();

	   let remove_extra_address = document.fileName.slice(
		document.fileName.indexOf('controllers')
	   );

	   // generate view path
	   let view_path = document.fileName.replace(remove_extra_address, '') + 'views/' + file_name;
	//    console.log('view_path: ' + view_path);

	   // We are looking for strings with filenames
	   // - simple hack for now we look for the string with our current word in it on our line
	   //   and where our cursor position is inside the string
	   let re_str = `\"(.*?${word}.*?)\"|\'(.*?${word}.*?)\'`;
	   let match = line.text.match(re_str);
 
	//    console.log('re_str: ' + re_str);
	//    console.log("   Match: ", match);
 
	   if (null !== match) {
		  let potential_fname = match[1] || match[2];
		  let match_start = match.index;
		  let match_end   = match.index + potential_fname.length;
 
		  // Verify the match string is at same location as cursor
		  if((position.character >= match_start) &&
			 (position.character <= match_end))
		  {
			 let full_path   = path.resolve(view_path, potential_fname);
			//  console.log(" Match: ", match);
			//  console.log(" Fname: " + potential_fname);
			//  console.log("  Full: " + full_path);
 
			 // Find all potential paths to check and return the first one found
			 let potential_fnames = this.getPotentialPaths(full_path);
			//  console.log(" potential fnames: ", potential_fnames);
 
			 let found_fname = potential_fnames.find((fname_full) => {
				//console.log(" checking: ", fname_full);
				return fs.existsSync(fname_full);
			 });
			 if (found_fname != null) {
				// console.log('found: ' + found_fname);
				return new vscode.Location(vscode.Uri.file(found_fname), new vscode.Position(0, 1));
			 }
		  }
	   }
 
	   return null;
	}
 }