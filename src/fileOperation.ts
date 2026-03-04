import { App, TFile } from 'obsidian';
import UltimateTodoistSyncForObsidian from "../main";
export class FileOperation   {
	app:App;
    plugin: UltimateTodoistSyncForObsidian;


	constructor(app:App, plugin:UltimateTodoistSyncForObsidian) {
		//super(app,settings);
		this.app = app;
        this.plugin = plugin;

	}
    /*
    async getFrontMatter(file:TFile): Promise<FrontMatter | null> {
        return new Promise((resolve) => {
          this.app.fileManager.processFrontMatter(file, (frontMatter) => {
            resolve(frontMatter);
          });
        });
    }
    */




    /*
    async updateFrontMatter(
    file:TFile,
    updater: (frontMatter: FrontMatter) => void
    ): Promise<void> {
        //console.log(`prepare to update front matter`)
        this.app.fileManager.processFrontMatter(file, (frontMatter) => {
        if (frontMatter !== null) {
        const updatedFrontMatter = { ...frontMatter } as FrontMatter;
        updater(updatedFrontMatter);
        this.app.fileManager.processFrontMatter(file, (newFrontMatter) => {
            if (newFrontMatter !== null) {
            newFrontMatter.todoistTasks = updatedFrontMatter.todoistTasks;
            newFrontMatter.todoistCount = updatedFrontMatter.todoistCount;
            }
        });
        }
    });
    }
    */





     // complete a task, mark it as done
    async completeTaskInTheFile(taskId: string) {
        // get task file path
        const currentTask = this.plugin.cacheOperation!.loadTaskFromCacheyID(taskId)
        const filepath = currentTask!.path

        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(taskId) && this.plugin.taskParser!.hasTodoistTag(line)) {
            lines[i] = line.replace('[ ]', '[x]')
            modified = true
            break
        }
        }

        if (modified) {
        const newContent = lines.join('\n')
        await this.app.vault.modify(file, newContent)
        }
    }

    // uncheck completed task
    async uncompleteTaskInTheFile(taskId: string) {
        // get task file path
        const currentTask = this.plugin.cacheOperation!.loadTaskFromCacheyID(taskId)
        const filepath = currentTask!.path

        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(taskId) && this.plugin.taskParser!.hasTodoistTag(line)) {
            lines[i] = line.replace(/- \[(x|X)\]/g, '- [ ]');
            modified = true
            break
        }
        }

        if (modified) {
        const newContent = lines.join('\n')
        await this.app.vault.modify(file, newContent)
        }
    }

    //add #todoist at the end of task line, if full vault sync enabled
    async addTodoistTagToFile(filepath: string) {
        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if(!this.plugin.taskParser!.isMarkdownTask(line)){
                //console.debug(line)
                //console.debug("It is not a markdown task.")
                continue;
            }
            //if content is empty
            if(this.plugin.taskParser!.getTaskContentFromLineText(line) == ""){
                //console.debug("Line content is empty")
                continue;
            }
            if (!this.plugin.taskParser!.hasTodoistId(line) && !this.plugin.taskParser!.hasTodoistTag(line)) {
                //console.debug(line)
                //console.debug('prepare to add todoist tag')
                const newLine = this.plugin.taskParser!.addTodoistTag(line);
                //console.debug(newLine)
                lines[i] = newLine
                modified = true
            }
        }

        if (modified) {
            console.debug(`New task found in files ${filepath}`)
            const newContent = lines.join('\n')
            //console.debug(newContent)
            await this.app.vault.modify(file, newContent)

            //update filemetadate
            const metadata = this.plugin.cacheOperation!.getFileMetadata(filepath)
            if(!metadata){
                this.plugin.cacheOperation!.newEmptyFileMetadata(filepath)
            }

        }
    }



    //add todoist at the line
    async addTodoistLinkToFile(filepath: string) {
        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (this.plugin.taskParser!.hasTodoistId(line) && this.plugin.taskParser!.hasTodoistTag(line)) {
                if(this.plugin.taskParser!.hasTodoistLink(line)){
                    return
                }
                console.debug(line)
                //console.debug('prepare to add todoist link')
                const taskID = this.plugin.taskParser!.getTodoistIdFromLineText(line)
                const taskObject = this.plugin.cacheOperation!.loadTaskFromCacheyID(taskID)
                const todoistLink = taskObject.url
                const link = `[link](${todoistLink})`
                const newLine = this.plugin.taskParser!.addTodoistLink(line,link)
                console.debug(newLine)
                lines[i] = newLine
                modified = true
            }else{
                continue
            }
        }

        if (modified) {
            const newContent = lines.join('\n')
            //console.debug(newContent)
            await this.app.vault.modify(file, newContent)



        }
    }


        //add #todoist at the end of task line, if full vault sync enabled
    async addTodoistTagToLine(filepath:string,lineText:string,lineNumber:number,fileContent:string) {
        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = fileContent

        const lines = content.split('\n')
        let modified = false


        const line = lineText
        if(!this.plugin.taskParser!.isMarkdownTask(line)){
            //console.debug(line)
            //console.debug("It is not a markdown task.")
            return;
        }
        //if content is empty
        if(this.plugin.taskParser!.getTaskContentFromLineText(line) == ""){
            //console.debug("Line content is empty")
            return;
        }
        if (!this.plugin.taskParser!.hasTodoistId(line) && !this.plugin.taskParser!.hasTodoistTag(line)) {
            //console.debug(line)
            //console.debug('prepare to add todoist tag')
            const newLine = this.plugin.taskParser!.addTodoistTag(line);
            //console.debug(newLine)
            lines[lineNumber] = newLine
            modified = true
        }


        if (modified) {
            console.debug(`New task found in files ${filepath}`)
            const newContent = lines.join('\n')
            console.debug(newContent)
            await this.app.vault.modify(file, newContent)

            //update filemetadate
            const metadata = this.plugin.cacheOperation!.getFileMetadata(filepath)
            if(!metadata){
                this.plugin.cacheOperation!.newEmptyFileMetadata(filepath)
            }

        }
    }

    // sync updated task content  to file
    async syncUpdatedTaskContentToTheFile(evt: { objectId: string; extraData: { content: string } }) {
        const taskId = evt.objectId
        // get task file path
        const currentTask = this.plugin.cacheOperation!.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path

        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser!.hasTodoistTag(line)) {
                const oldTaskContent = this.plugin.taskParser!.getTaskContentFromLineText(line)
                const newTaskContent = evt.extraData.content

                lines[i] = line.replace(oldTaskContent, newTaskContent)
                modified = true
                break
            }
        }

        if (modified) {
        const newContent = lines.join('\n')
        //console.debug(newContent)
        await this.app.vault.modify(file, newContent)
        }

    }

    // sync updated task due date  to the file
    async syncUpdatedTaskDueDateToTheFile(evt: { objectId: string; extraData: { due_date: string } }) {
        const taskId = evt.objectId
        // get task file path
        const currentTask = this.plugin.cacheOperation!.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path

        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.includes(taskId) && this.plugin.taskParser!.hasTodoistTag(line)) {
            const oldTaskDueDate = this.plugin.taskParser!.getDueDateFromLineText(line) || ""
            const newTaskDueDate = this.plugin.taskParser!.ISOStringToLocalDateString(evt.extraData.due_date) || ""

            //console.debug(`${taskId} duedate is updated`)
            console.debug(oldTaskDueDate)
            console.debug(newTaskDueDate)
            if(oldTaskDueDate === ""){
                //console.debug(this.plugin.taskParser!.insertDueDateBeforeTodoist(line,newTaskDueDate))
                lines[i] = this.plugin.taskParser!.insertDueDateBeforeTodoist(line,newTaskDueDate)
                modified = true

            }
            else if(newTaskDueDate === ""){
                //remove date from text
                const regexRemoveDate = /(🗓️|📅|📆|🗓)\s?\d{4}-\d{2}-\d{2}/; //match date format 🗓️2023-03-07
                lines[i] = line.replace(regexRemoveDate,"")
                modified = true
            }
            else{

                lines[i] = line.replace(oldTaskDueDate, newTaskDueDate)
                modified = true
            }
            break
        }
        }

        if (modified) {
        const newContent = lines.join('\n')
        //console.debug(newContent)
        await this.app.vault.modify(file, newContent)
        }

    }


    // sync new task note to file
    async syncAddedTaskNoteToTheFile(evt: { parentItemId: string; extraData: { content: string }; eventDate: string }) {


        const taskId = evt.parentItemId
        const note = evt.extraData.content
        const datetime = this.plugin.taskParser!.ISOStringToLocalDatetimeString(evt.eventDate)
        // get task file path
        const currentTask = this.plugin.cacheOperation!.loadTaskFromCacheyID(taskId)
        const filepath = currentTask.path

        // get file object and update content
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        let modified = false

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line.includes(taskId) && this.plugin.taskParser!.hasTodoistTag(line)) {
                const indent = '\t'.repeat(line.length - line.trimStart().length + 1);
                const noteLine = `${indent}- ${datetime} ${note}`;
                lines.splice(i + 1, 0, noteLine);
                modified = true
                break
            }
        }

        if (modified) {
        const newContent = lines.join('\n')
        //console.debug(newContent)
        await this.app.vault.modify(file, newContent)
        }

    }


    //avoid using this method, use view to get real-time updated value
    async readContentFromFilePath(filepath:string){
        try {
            const abstractFile = this.app.vault.getAbstractFileByPath(filepath);
            if (!(abstractFile instanceof TFile)) return false;
            const file = abstractFile;
            const content = await this.app.vault.read(file);
            return content
        } catch (error) {
            console.error(`Error loading content from ${filepath}: ${(error as Error).message}`);
            return false;
        }
    }

    //get line text from file path
    //use view.editor.getLine instead, the read method has a delay
    async getLineTextFromFilePath(filepath:string,lineNumber:number) {

        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return undefined;
        const file = abstractFile;
        const content = await this.app.vault.read(file)

        const lines = content.split('\n')
        return(lines[lineNumber])
    }

    //search todoist_id by content
    async searchTodoistIdFromFilePath(filepath: string, searchTerm: string): Promise<string | null> {
        const abstractFile = this.app.vault.getAbstractFileByPath(filepath)
        if (!(abstractFile instanceof TFile)) return null;
        const file = abstractFile;
        const fileContent = await this.app.vault.read(file)
        const fileLines = fileContent.split('\n');
        let todoistId: string | null = null;

        for (let i = 0; i < fileLines.length; i++) {
        const line = fileLines[i];

        if (line.includes(searchTerm)) {
            const regexResult = /\[todoist_id::\s*(\w+)\]/.exec(line);

            if (regexResult) {
            todoistId = regexResult[1];
            }

            break;
        }
        }

        return todoistId;
    }

    //get all files in the vault
    getAllFilesInTheVault(){
        const files = this.app.vault.getFiles()
        return(files)
    }

    //search filepath by taskid in vault
    async searchFilepathsByTaskidInVault(taskId:string){
        console.debug(`preprare to search task ${taskId}`)
        const files = this.getAllFilesInTheVault()
        //console.debug(files)
        const tasks = files.map(async (file) => {
            if (!this.isMarkdownFile(file.path)) {
                return;
            }
            const fileContent = await this.app.vault.cachedRead(file);
            if (fileContent.includes(taskId)) {
                return file.path;
            }
        });

        const results = await Promise.all(tasks);
        const filePaths = results.filter((filePath) => filePath !== undefined);
        return filePaths[0] || null;
        //return filePaths || null
    }


    isMarkdownFile(filename:string) {
        // get file extension
        let extension = filename.split('.').pop();

        // convert extension to lowercase (Markdown file extension is typically .md)
        extension = extension!.toLowerCase();

        // check if extension is .md
        if (extension === 'md') {
          return true;
        } else {
          return false;
        }
      }





}
