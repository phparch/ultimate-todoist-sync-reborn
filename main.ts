import { MarkdownView, Notice, Plugin, Editor } from 'obsidian';


//settings
import { UltimateTodoistSyncSettings,DEFAULT_SETTINGS,UltimateTodoistSyncSettingTab } from './src/settings';
//todoist  api
import { TodoistRestAPI } from './src/todoistRestAPI';
import { TodoistSyncAPI } from './src/todoistSyncAPI';
//task parser
import { TaskParser } from './src/taskParser';
//cache task read and write
import { CacheOperation } from './src/cacheOperation';
//file operation
import { FileOperation } from './src/fileOperation';

//sync module
import { TodoistSync } from './src/syncModule';


//import modal
import { SetDefalutProjectInTheFilepathModal } from 'src/modal';

export default class UltimateTodoistSyncForObsidian extends Plugin {
	settings: UltimateTodoistSyncSettings;
    todoistRestAPI: TodoistRestAPI | undefined;
    todoistSyncAPI: TodoistSyncAPI | undefined;
    taskParser: TaskParser | undefined;
    cacheOperation: CacheOperation | undefined;
    fileOperation: FileOperation | undefined;
    todoistSync: TodoistSync | undefined;
	lastLines: Map<string,number>;
	statusBar: HTMLElement;
	syncLock: boolean;

	async onload() {

		const isSettingsLoaded = await this.loadSettings();

		if(!isSettingsLoaded){
			new Notice('Settings failed to load. Please reload the ultimate todoist sync plugin.');
			return;
		}
		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new UltimateTodoistSyncSettingTab(this.app, this));
		if (!this.settings.todoistAPIToken) {
			new Notice('Please enter your Todoist API.');
			//return
		}else{
			await this.initializePlugin();
		}

		//lastLine object {path:line} stored in lastLines map
		this.lastLines = new Map();







		//key event listener for line changes and deletions
		this.registerDomEvent(document, 'keyup', async (evt: KeyboardEvent) =>{
			if(!this.settings.apiInitialized){
				return
			}
			//console.log(`key pressed`)

			//check if the event occurs in the editor area, if not return
			if (!(this.app.workspace.activeEditor?.editor?.hasFocus())) {
				(console.debug(`editor is not focused`))
				return
			}

			if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown' || evt.key === 'ArrowLeft' || evt.key === 'ArrowRight' ||evt.key === 'PageUp' || evt.key === 'PageDown') {
				//console.log(`${evt.key} arrow key is released`);
				if(!( this.checkModuleClass())){
					return
				}
				void this.lineNumberCheck()
			}
			if(evt.key === "Delete" || evt.key === "Backspace"){
				try{
					//console.log(`${evt.key} key is released`);
					if(!( this.checkModuleClass())){
						return
					}
					if (!await this.checkAndHandleSyncLock()) return;
					const activeFilePath = this.app.workspace.getActiveFile()?.path;
					if (!activeFilePath) return;
					await this.todoistSync!.deletedTaskCheck(activeFilePath);
					this.syncLock = false;
					void this.saveSettings()
				}catch(error){
					console.error(`An error occurred while deleting tasks: ${error}`);
					this.syncLock = false
				}

			}
		});

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			if(!this.settings.apiInitialized){
				return
			}
			//console.log('click', evt);
			if (this.app.workspace.activeEditor?.editor?.hasFocus()) {
				//console.log('Click event: editor is focused');
				void this.lineNumberCheck()
			}
			else{
				//
			}

			const target = evt.target as HTMLInputElement;

			if (target.type === "checkbox") {
				if(!(this.checkModuleClass())){
					return
				}
				void this.checkboxEventhandle(evt)
				//this.todoistSync.fullTextModifiedTaskCheck()

			}

		});



		//hook editor-change event, if current line contains #todoist, it indicates a new task
		this.registerEvent(this.app.workspace.on('editor-change',async (editor,view:MarkdownView)=>{
			try{
				if(!this.settings.apiInitialized){
					if(this.settings.debugMode) console.debug('editor-change: apiInitialized is false')
					return
				}

				void this.lineNumberCheck()
				if(!(this.checkModuleClass())){
					if(this.settings.debugMode) console.debug('editor-change: checkModuleClass failed')
					return
				}
				if(this.settings.enableFullVaultSync){
					if(this.settings.debugMode) console.debug('editor-change: skipping (fullVaultSync enabled)')
					return
				}
				if (!await this.checkAndHandleSyncLock()) return;
				if(this.settings.debugMode) console.debug('editor-change: calling lineContentNewTaskCheck')
				await this.todoistSync!.lineContentNewTaskCheck(editor,view)
				this.syncLock = false
				void this.saveSettings()

			}catch(error){
				console.error(`An error occurred while check new task in line: ${error.message}`);
				this.syncLock = false
			}

		}))



/* When moving files with another file manager, obsidian triggers a delete event that deleted all tasks
		//listen for delete events, when a file is deleted, read the tasklist from frontMatter and batch delete
		this.registerEvent(this.app.metadataCache.on('deleted', async(file,prevCache) => {
			try{
				if(!this.settings.apiInitialized){
					return
				}
				//console.log('a new file has modified')
				console.log(`file deleted`)
				//read frontMatter
				const frontMatter = await this.cacheOperation.getFileMetadata(file.path)
				if(frontMatter === null || frontMatter.todoistTasks === undefined){
					console.log('There is no task in the deleted files.')
					return
				}
				//check if todoistTasks is null
				console.log(frontMatter.todoistTasks)
				if(!( this.checkModuleClass())){
						return
				}
				if (!await this.checkAndHandleSyncLock()) return;
				await this.todoistSync.deleteTasksByIds(frontMatter.todoistTasks)
				this.syncLock = false
				this.saveSettings()
			}catch(error){
				console.error(`An error occurred while deleting task in the file: ${error}`);
				this.syncLock = false
			}



		}));
*/


		//listen for rename events, update path in task data
		this.registerEvent(this.app.vault.on('rename', async (file,oldpath) => {
			if(!this.settings.apiInitialized){
				return
			}
			console.debug(`${oldpath} is renamed`)
			//read frontMatter
			//const frontMatter = await this.fileOperation.getFrontMatter(file)
			const frontMatter =  await this.cacheOperation!.getFileMetadata(oldpath)
			console.debug(frontMatter)
			if(frontMatter === null || frontMatter.todoistTasks === undefined){
				//console.log('No tasks in the deleted file')
				return
			}
			if(!(this.checkModuleClass())){
					return
				}
			await this.cacheOperation!.updateRenamedFilePath(oldpath,file.path)
			void this.saveSettings()

			//update task description
			if (!await this.checkAndHandleSyncLock()) return;
			try {
				await this.todoistSync!.updateTaskDescription(file.path)
			} catch(error) {
				console.error('An error occurred in updateTaskDescription:', error);
			}
			this.syncLock = false;

		}));


		//Listen for file modified events and execute fullTextNewTaskCheck
		this.registerEvent(this.app.vault.on('modify', async (file) => {
			try {
				if(!this.settings.apiInitialized){
					return
				}
				const filepath = file.path
				console.debug(`${filepath} is modified`)

				//get current view

				const activateFile = this.app.workspace.getActiveFile()

				console.debug(activateFile?.path)

				//To avoid conflicts, Do not check files being edited
				if(activateFile?.path == filepath){
					return
				}

				if (!await this.checkAndHandleSyncLock()) return;

				await this.todoistSync!.fullTextNewTaskCheck(filepath)
				this.syncLock = false;
			} catch(error) {
				console.error(`An error occurred while modifying the file: ${error.message}`);
				this.syncLock = false
				// You can add further error handling logic here. For example, you may want to
				// revert certain operations, or alert the user about the error.
			}
		}));

		this.registerInterval(window.setInterval(() => { void this.scheduledSynchronization(); }, Number(this.settings.automaticSynchronizationInterval) * 1000));

		this.app.workspace.on('active-leaf-change',(leaf)=>{
			void this.setStatusBarText()
		})


		// set default  project for todoist task in the current file
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'set-default-project-for-todoist-task-in-the-current-file',
			name: 'Set default project for Todoist task in the current file',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				if(!view){
					return
				}
				const filepath = view.file!.path
				new SetDefalutProjectInTheFilepathModal(this.app,this,filepath)

			}
		});

		//display default project for the current file on status bar
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		this.statusBar = this.addStatusBarItem();


	}


	onunload() {
		console.debug(`Ultimate Todoist Sync: Reborn is unloaded!`)
		void this.saveSettings()

	}

	async loadSettings() {
		try {
			const data = await this.loadData();
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
			return true; // return true indicates settings loaded successfully
		} catch (error) {
			console.error('Failed to load data:', error);
			return false; // return false indicates settings failed to load
		}
	}

	async saveSettings() {
		try {
			// verify settings exist and are not empty
			if (this.settings && Object.keys(this.settings).length > 0) {
				await this.saveData(this.settings);
			} else {
				console.error('Settings are empty or invalid, not saving to avoid data loss.');
			}
		} catch (error) {
			// log or handle error
			console.error('Error saving settings:', error);
		}
	}

	async modifyTodoistAPI(api:string){
		await this.initializePlugin()
	}

	// return true of false
	async initializePlugin(){

		//initialize todoist restapi
		this.todoistRestAPI = new TodoistRestAPI(this.app, this)

		//initialize data read and write object
		this.cacheOperation = new CacheOperation(this.app, this)
		const isProjectsSaved = await this.cacheOperation.saveProjectsToCache()



		if(!isProjectsSaved){
			this.todoistRestAPI = undefined
			this.todoistSyncAPI = undefined
			this.taskParser = undefined
			this.taskParser = undefined
			this.cacheOperation = undefined
			this.fileOperation = undefined
			this.todoistSync = undefined
			new Notice(`Ultimate Todoist Sync: Reborn plugin initialization failed, please check the Todoist API`)
			return;
		}

		if(!this.settings.initialized){

			//create backup folder for todoist data
			try{
				//first time launching plugin, backup todoist data
				this.taskParser = new TaskParser(this.app, this)

				//initialize file operation
				this.fileOperation = new FileOperation(this.app,this)

				//initialize todoisy sync api
				this.todoistSyncAPI = new TodoistSyncAPI(this.app,this)

				//initialize todoist sync module
				this.todoistSync = new TodoistSync(this.app,this)

				//backup all data before each startup
				void this.todoistSync.backupTodoistAllResources()

			}catch(error){
				console.error(`error creating user data folder: ${error}`)
				new Notice(`Error creating user data folder`)
				return;
			}


			//initialize settings
			this.settings.initialized = true
			void this.saveSettings()
			new Notice(`Ultimate Todoist Sync: Reborn initialization successful. Todoist data has been backed up.`)

		}


		this.initializeModuleClass()

		// auto-populate default project ID if empty
		if(!this.settings.defaultProjectId){
			const projects = this.settings.todoistTasksData?.projects
			if(projects && projects.length > 0){
				const inbox = projects.find((p) => p.name === 'Inbox') || projects[0]
				this.settings.defaultProjectId = inbox.id
				this.settings.defaultProjectName = inbox.name
				void this.saveSettings()
			}
		}

		//get user plan resources
		//const rsp = await this.todoistSyncAPI.getUserResource()
		this.settings.apiInitialized = true
		this.syncLock = false
		new Notice(`Ultimate Todoist Sync: Reborn loaded successfully.`)
		return true



	}

	initializeModuleClass(){

		//initialize todoist restapi
		this.todoistRestAPI = new TodoistRestAPI(this.app,this)

		//initialize data read and write object
		this.cacheOperation = new CacheOperation(this.app,this)
		this.taskParser = new TaskParser(this.app,this)

		//initialize file operation
		this.fileOperation = new FileOperation(this.app,this)

		//initialize todoisy sync api
		this.todoistSyncAPI = new TodoistSyncAPI(this.app,this)

		//initialize todoist sync module
		this.todoistSync = new TodoistSync(this.app,this)


	}

	async lineNumberCheck(){
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if(view){
			const cursor = view.app.workspace.getActiveViewOfType(MarkdownView)?.editor.getCursor()
			const line = cursor?.line
			//const lineText = view.editor.getLine(line)
			const fileContent = view.data

			//console.log(line)
			//const fileName = view.file?.name
			const fileName =  view.app.workspace.getActiveViewOfType(MarkdownView)?.app.workspace.activeEditor?.file?.name
			const filepath =  view.app.workspace.getActiveViewOfType(MarkdownView)?.app.workspace.activeEditor?.file?.path
			if (typeof this.lastLines === 'undefined' || typeof this.lastLines.get(fileName as string) === 'undefined'){
				this.lastLines.set(fileName as string, line as number);
				return
			}

					//console.log(`filename is ${fileName}`)
			if(this.lastLines.has(fileName as string) && line !== this.lastLines.get(fileName as string)){
				const lastLine = this.lastLines.get(fileName as string)
				if(this.settings.debugMode){
					console.debug('Line changed!', `current line is ${line}`, `last line is ${lastLine}`);
				}


				// execute the desired operation
				const lastLineText = view.editor.getLine(lastLine as number)
				//console.log(lastLineText)
				if(!( this.checkModuleClass())){
					return
				}
				this.lastLines.set(fileName as string, line as number);
				try{
					if (!await this.checkAndHandleSyncLock()) return;
					await this.todoistSync!.lineModifiedTaskCheck(filepath as string,lastLineText,lastLine as number,fileContent)
					this.syncLock = false;
				}catch(error){
					console.error(`An error occurred while check modified task in line text: ${error}`);
					this.syncLock = false
				}



			}
			else  {
				//console.log('Line not changed');
			}

		}




	}

	async checkboxEventhandle(evt:MouseEvent){
		if(!( this.checkModuleClass())){
			return
		}
		const target = evt.target as HTMLInputElement;

		const taskElement = target.closest("div");    //use evt.target.closest() to find a specific parent element instead of directly accessing a specific index in the event path
		//console.log(taskElement)
		if (!taskElement) return;
		const regex = /\[todoist_id:: ([\w]+)\]/; // match strings in [todoist_id:: characters] format
		const match = taskElement.textContent?.match(regex) || false;
		if (match) {
			const taskId = match[1];
			//console.log(taskId)
			//const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (target.checked) {
				void this.todoistSync!.closeTask(taskId);
			} else {
				void this.todoistSync!.repoenTask(taskId);
			}
		} else {
			//console.log('todoist_id not found');
			//start full text search, check for status updates
			try{
				if (!await this.checkAndHandleSyncLock()) return;
				const activeFilePathForCheck = this.app.workspace.getActiveFile()?.path;
				if (!activeFilePathForCheck) return;
				await this.todoistSync!.fullTextModifiedTaskCheck(activeFilePathForCheck)
				this.syncLock = false;
			}catch(error){
				console.error(`An error occurred while check modified tasks in the file: ${error}`);
				this.syncLock = false;
			}

		}
	}

	//return true
	checkModuleClass(){
		if(this.settings.apiInitialized  === true){
			if(this.todoistRestAPI === undefined || this.todoistSyncAPI === undefined ||this.cacheOperation === undefined || this.fileOperation === undefined ||this.todoistSync === undefined ||this.taskParser === undefined){
				this.initializeModuleClass()
			}
			return true
		}
		else{
			new Notice(`Please enter the correct Todoist API token.`)
			return(false)
		}


	}

	setStatusBarText(){
		if(!( this.checkModuleClass())){
			return
		}
		const view = this.app.workspace.getActiveViewOfType(MarkdownView)
		if(!view){
			this.statusBar.setText('');
		}
		else{
			const filepath = this.app.workspace.getActiveViewOfType(MarkdownView)?.file?.path
			if(filepath === undefined){
				console.debug(`file path undefined`)
				return
			}
			const defaultProjectName = this.cacheOperation!.getDefaultProjectNameForFilepath(filepath)
			if(!defaultProjectName){
				console.debug(`projectName undefined`)
				return
			}
			this.statusBar.setText(defaultProjectName)
		}

	}

	async scheduledSynchronization() {
		if (!(this.checkModuleClass())) {
			return;
		}
		console.debug("Todoist scheduled synchronization task started at", new Date().toLocaleString());
		try {
			if (!await this.checkAndHandleSyncLock()) return;
			try {
				await this.todoistSync!.syncTodoistToObsidian();
			} catch(error) {
				console.error('An error occurred in syncTodoistToObsidian:', error);
			}
			this.syncLock = false;
			try {
				await this.saveSettings();
			} catch(error) {
				console.error('An error occurred in saveSettings:', error);
			}

			// Sleep for 5 seconds
			await new Promise(resolve => setTimeout(resolve, 5000));

			const filesToSync = this.settings.fileMetadata;
			if(this.settings.debugMode){
				console.debug(filesToSync)
			}

			for (let fileKey in filesToSync) {
				if(this.settings.debugMode){
					console.debug(fileKey)
				}

				if (!await this.checkAndHandleSyncLock()) return;
				try {
					await this.todoistSync!.fullTextNewTaskCheck(fileKey);
				} catch(error) {
					console.error('An error occurred in fullTextNewTaskCheck:', error);
				}
				this.syncLock = false;

				if (!await this.checkAndHandleSyncLock()) return;
				try {
					await this.todoistSync!.deletedTaskCheck(fileKey);
				} catch(error) {
					console.error('An error occurred in deletedTaskCheck:', error);
				}
				this.syncLock = false;

				if (!await this.checkAndHandleSyncLock()) return;
				try {
					await this.todoistSync!.fullTextModifiedTaskCheck(fileKey);
				} catch(error) {
					console.error('An error occurred in fullTextModifiedTaskCheck:', error);
				}
				this.syncLock = false;
			}

		} catch (error) {
			console.error('An error occurred:', error);
			new Notice(`An error occurred: ${error}`);
			this.syncLock = false;
		}
		console.debug("Todoist scheduled synchronization task completed at", new Date().toLocaleString());
	}

	async checkSyncLock() {
		let checkCount = 0;
		while (this.syncLock == true && checkCount < 10) {
		  await new Promise(resolve => setTimeout(resolve, 1000));
		  checkCount++;
		}
		if (this.syncLock == true) {
		  return false;
		}
		return true;
	}

	async checkAndHandleSyncLock() {
		if (this.syncLock) {
			console.debug('sync locked.');
			const isSyncLockChecked = await this.checkSyncLock();
			if (!isSyncLockChecked) {
				return false;
			}
			console.debug('sync unlocked.')
		}
		this.syncLock = true;
		return true;
	}

}




