import UltimateTodoistSyncForObsidian from "../main";
import { App, Editor, MarkdownView, Notice, TFile} from 'obsidian';
import { TodoistTask, SyncEvent } from './settings';


export class TodoistSync  {
	app:App;
    plugin: UltimateTodoistSyncForObsidian;


	constructor(app:App, plugin:UltimateTodoistSyncForObsidian) {
		//super(app,settings,todoistRestAPI,todoistSyncAPI,taskParser,cacheOperation);
		this.app = app;
        this.plugin = plugin;

	}





    async deletedTaskCheck(file_path:string): Promise<void> {

        let file
        let currentFileValue
        let view
        let filepath

        if(file_path){
            const abstractFile = this.app.vault.getAbstractFileByPath(file_path)
            if (!(abstractFile instanceof TFile)) return;
            file = abstractFile
            filepath = file_path
            currentFileValue = await this.app.vault.read(file)
        }
        else{
            view = this.app.workspace.getActiveViewOfType(MarkdownView);
            //const editor = this.app.workspace.activeEditor?.editor
            file = this.app.workspace.getActiveFile()
            filepath = file?.path
            //use view.data instead of vault.read, vault.read has a delay
            currentFileValue = view?.data
        }


        //console.debug(filepath)


        //const frontMatter = await this.plugin.fileOperation.getFrontMatter(file);
        const frontMatter = this.plugin.cacheOperation!.getFileMetadata(filepath!)
        if (!frontMatter || !frontMatter.todoistTasks) {
          console.debug('no tasks in frontmatter')
          return;
        }



        //console.debug(currentFileValue)
        const currentFileValueWithOutFrontMatter = currentFileValue!.replace(/^---[\s\S]*?---\n/, '');
        const frontMatter_todoistTasks = frontMatter.todoistTasks;
        const frontMatter_todoistCount = frontMatter.todoistCount;

        const deleteTasksPromises = frontMatter_todoistTasks
          .filter((taskId: string) => !currentFileValueWithOutFrontMatter.includes(taskId))
          .map(async (taskId: string) => {
            try {
              //console.debug(`initialize todoist api`)
              const api = this.plugin.todoistRestAPI!.initializeAPI()
              const response = await api.deleteTask(taskId);
              //console.debug(`response is ${response}`);

              if (response) {
                //console.debug(`task ${taskId} deleted successfully`);
                new Notice(`Task ${taskId} is deleted.`)
                return taskId; // return the deleted task ID
              }
            } catch (error) {
              console.error(`Failed to delete task ${taskId}: ${error}`);
            }
          });

        const deletedTaskIds = await Promise.all(deleteTasksPromises);
        const deletedTaskAmount = deletedTaskIds.length
        if (!deletedTaskIds.length) {
          //console.debug("no tasks deleted");
          return;
        }
        this.plugin.cacheOperation!.deleteTaskFromCacheByIDs(deletedTaskIds)
        //console.debug(`deleted ${deletedTaskAmount} tasks`)
        void this.plugin.saveSettings()
        // update newFrontMatter_todoistTasks array

        // Disable automatic merging

        const newFrontMatter_todoistTasks = frontMatter_todoistTasks.filter(
          (taskId: string) => !deletedTaskIds.includes(taskId)
        );


        /*
        await this.plugin.fileOperation.updateFrontMatter(file, (frontMatter) => {
          frontMatter.todoistTasks = newFrontMatter_todoistTasks;
          frontMatter.todoistCount = frontMatter_todoistCount - deletedTaskAmount;
        });
        */
        const newFileMetadata = {todoistTasks:newFrontMatter_todoistTasks,todoistCount:(frontMatter_todoistCount - deletedTaskAmount)}
        this.plugin.cacheOperation!.updateFileMetadata(filepath!,newFileMetadata)
    }

    async lineContentNewTaskCheck(editor:Editor,view:MarkdownView): Promise<void>{
        //const editor = this.app.workspace.activeEditor?.editor
        //const view =this.app.workspace.getActiveViewOfType(MarkdownView)

        const filepath = view.file?.path
        const fileContent = view?.data
        const cursor = editor.getCursor()
        const line = cursor.line
        const linetxt = editor.getLine(line)





        if(this.plugin.settings.debugMode){
            console.debug(`lineContentNewTaskCheck: line=${line}, text="${linetxt}"`)
            console.debug(`  hasTodoistId=${this.plugin.taskParser!.hasTodoistId(linetxt)}, hasTodoistTag=${this.plugin.taskParser!.hasTodoistTag(linetxt)}`)
        }

        //add task
        if ((!this.plugin.taskParser!.hasTodoistId(linetxt) && this.plugin.taskParser!.hasTodoistTag(linetxt))) {   //check if contains #todoist
            console.debug('this is a new task')
            console.debug(linetxt)
            const currentTask = this.plugin.taskParser!.convertTextToTodoistTaskObject(linetxt,filepath!,line,fileContent)
            //console.debug(currentTask)



            try {
                const newTask = await this.plugin.todoistRestAPI!.AddTask(currentTask as Parameters<typeof this.plugin.todoistRestAPI.AddTask>[0])
                const { id: todoist_id } = newTask;
                Object.assign(newTask, { path: filepath });
                //console.debug(newTask);
                new Notice(`new task ${newTask.content} id is ${newTask.id}`)
                //write newTask to cache
                this.plugin.cacheOperation!.appendTaskToCache(newTask)

                //if task is completed
                if(currentTask.isCompleted === true){
                  await this.plugin.todoistRestAPI!.CloseTask(newTask.id)
                  this.plugin.cacheOperation!.closeTaskToCacheByID(todoist_id)

                }
                void this.plugin.saveSettings()

                //save todoist id after the task
                const text_with_out_link = `${linetxt} %%[todoist_id:: ${todoist_id}]%%`;
                const link = this.plugin.settings.useAppURI ? `[link](todoist://task?id=${newTask.id})` : `[link](${newTask.url})`
                const text = this.plugin.taskParser!.addTodoistLink(text_with_out_link,link)
                const from = { line: cursor.line, ch: 0 };
                const to = { line: cursor.line, ch: linetxt.length };
                view.app.workspace.activeEditor?.editor?.replaceRange(text, from, to)

                //handle frontMatter
                try {
                    // handle front matter
                    const frontMatter = this.plugin.cacheOperation!.getFileMetadata(filepath!)
                      //console.debug(frontMatter);

                      if (!frontMatter) {
                        //console.debug('frontmatter is empty');
                        //return;
                      }

                      // increment todoistCount by 1
                      const newFrontMatter = { ...frontMatter };
                      newFrontMatter.todoistCount = (newFrontMatter.todoistCount ?? 0) + 1;

                      // record taskID
                      newFrontMatter.todoistTasks = [...(newFrontMatter.todoistTasks || []), todoist_id];

                      // update front matter
                      /*
                     this.plugin.fileOperation.updateFrontMatter(view.file, (frontMatter) => {
                        frontMatter.todoistTasks = newFrontMatter.todoistTasks;
                        frontMatter.todoistCount = newFrontMatter.todoistCount;
                      });
                      */
                      //console.debug(newFrontMatter)
                      this.plugin.cacheOperation!.updateFileMetadata(filepath!,newFrontMatter)



                  } catch (error) {
                    console.error(error);
                  }

              } catch (error) {
                    console.error('Error adding task:', error);
                    console.debug(`The error occurred in the file: ${filepath}`)
                    return
              }

        }
    }


    async fullTextNewTaskCheck(file_path:string): Promise<void>{

        let file
        let currentFileValue
        let view
        let filepath

        if(file_path){
            const abstractFile = this.app.vault.getAbstractFileByPath(file_path)
            if (!(abstractFile instanceof TFile)) return;
            file = abstractFile
            filepath = file_path
            currentFileValue = await this.app.vault.read(file)
        }
        else{
            view = this.app.workspace.getActiveViewOfType(MarkdownView);
            //const editor = this.app.workspace.activeEditor?.editor
            file = this.app.workspace.getActiveFile()
            filepath = file?.path
            //use view.data instead of vault.read, vault.read has a delay
            currentFileValue = view?.data
        }

        if(this.plugin.settings.enableFullVaultSync){
            //console.debug('full vault sync enabled')
            //console.debug(filepath)
            await this.plugin.fileOperation!.addTodoistTagToFile(filepath!)
        }

        const content = currentFileValue!

        let newFrontMatter: { todoistTasks: string[]; todoistCount: number }
        //frontMatteer
        const frontMatter = this.plugin.cacheOperation!.getFileMetadata(filepath!)
        //console.debug(frontMatter);

        if (!frontMatter) {
            console.debug('frontmatter is empty');
            newFrontMatter = { todoistTasks: [], todoistCount: 0 };
        }else{
            newFrontMatter = { ...frontMatter };
        }


        let hasNewTask = false;
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (!this.plugin.taskParser!.hasTodoistId(line) && this.plugin.taskParser!.hasTodoistTag(line)) {
            //console.debug('this is a new task')
            //console.debug(`current line is ${i}`)
            //console.debug(`line text: ${line}`)
            console.debug(filepath)
            const currentTask = this.plugin.taskParser!.convertTextToTodoistTaskObject(line,filepath!,i,content)
            if(typeof currentTask === "undefined"){
                continue
            }
            console.debug(currentTask)
            try {
                const newTask = await this.plugin.todoistRestAPI!.AddTask(currentTask as Parameters<typeof this.plugin.todoistRestAPI.AddTask>[0])
                const { id: todoist_id } = newTask;
                Object.assign(newTask, { path: filepath });
                console.debug(newTask);
                new Notice(`new task ${newTask.content} id is ${newTask.id}`)
                //write newTask to JSON file
                this.plugin.cacheOperation!.appendTaskToCache(newTask)

                //if task is completed
                if(currentTask.isCompleted === true){
                await this.plugin.todoistRestAPI!.CloseTask(newTask.id)
                this.plugin.cacheOperation!.closeTaskToCacheByID(todoist_id)
                }
                void this.plugin.saveSettings()

                //save todoist id after the task
                const text_with_out_link = `${line} %%[todoist_id:: ${todoist_id}]%%`;
                const link = `[link](${newTask.url})`
                const text = this.plugin.taskParser!.addTodoistLink(text_with_out_link,link)
                lines[i] = text;

                newFrontMatter.todoistCount = (newFrontMatter.todoistCount ?? 0) + 1;

                // record taskID
                newFrontMatter.todoistTasks = [...(newFrontMatter.todoistTasks || []), todoist_id];

                hasNewTask = true

            } catch (error) {
                console.error('Error adding task:', error);
                continue
            }

        }
        }
        if(hasNewTask){
            //text and frontMatter
            try {
                // save file
                const newContent = lines.join('\n')
                const abstractFile = this.app.vault.getAbstractFileByPath(filepath!)
                if (!(abstractFile instanceof TFile)) return;
                await this.app.vault.modify(abstractFile, newContent)


                // update front matter
                /*
                this.plugin.fileOperation.updateFrontMatter(file, (frontMatter) => {
                frontMatter.todoistTasks = newFrontMatter.todoistTasks;
                frontMatter.todoistCount = newFrontMatter.todoistCount;
                });
                */

                this.plugin.cacheOperation!.updateFileMetadata(filepath!,newFrontMatter)

            } catch (error) {
            console.error(error);
            }

        }


    }


    async lineModifiedTaskCheck(filepath:string,lineText:string,lineNumber:number,fileContent:string): Promise<void>{
        //const lineText = await this.plugin.fileOperation.getLineTextFromFilePath(filepath,lineNumber)

        if(this.plugin.settings.enableFullVaultSync){
            //await this.plugin.fileOperation.addTodoistTagToLine(filepath,lineText,lineNumber,fileContent)

            //new empty metadata
            const metadata = this.plugin.cacheOperation!.getFileMetadata(filepath)
            if(!metadata){
                this.plugin.cacheOperation!.newEmptyFileMetadata(filepath)
            }
            void this.plugin.saveSettings()
        }

        //check task
        if (this.plugin.taskParser!.hasTodoistId(lineText) && this.plugin.taskParser!.hasTodoistTag(lineText)) {

            const lineTask = this.plugin.taskParser!.convertTextToTodoistTaskObject(lineText,filepath,lineNumber,fileContent)
            //console.debug(lastLineTask)
            const lineTask_todoist_id = (lineTask.todoist_id!).toString()
            //console.debug(lineTask_todoist_id )
            //console.debug(`lastline task id is ${lastLineTask_todoist_id}`)
            const savedTask = this.plugin.cacheOperation!.loadTaskFromCacheyID(lineTask_todoist_id)  //in dataview id is numeric, in todoist id is string, conversion needed
            if(!savedTask){
                console.debug(`task ${lineTask.todoist_id} not found in local cache`)
                const url = this.plugin.taskParser!.getObsidianUrlFromFilepath(filepath)
                console.debug(url)
                return
            }
        //console.debug(savedTask)

            //check if content was modified
            const lineTaskContent = lineTask.content;


            //check if content was modified
            const contentModified = !this.plugin.taskParser!.taskContentCompare(lineTask,savedTask)
            //check if tags or labels were modified
            const tagsModified = !this.plugin.taskParser!.taskTagCompare(lineTask,savedTask)
            //check if project was modified
            const projectModified = !this.plugin.taskParser!.taskProjectCompare(lineTask,savedTask)
            //check if status was modified
            const statusModified = !this.plugin.taskParser!.taskStatusCompare(lineTask,savedTask)
            //check if due date was modified
            const dueDateModified = !this.plugin.taskParser!.compareTaskDueDate(lineTask,savedTask)
            //check if parent id was modified
            const parentIdModified = !(lineTask.parentId === savedTask.parentId)
            //check priority
            const priorityModified = !(lineTask.priority === savedTask.priority)

            try {
            let contentChanged= false;
            let tagsChanged = false;
            let projectChanged = false;
            let statusChanged = false;
            let dueDateChanged = false;
            let parentIdChanged = false;
            let priorityChanged = false;

            let updatedContent: Record<string, unknown> = {}
            if (contentModified) {
                console.debug(`Content modified for task ${lineTask_todoist_id}`)
                updatedContent.content = lineTaskContent
                contentChanged = true;
            }

            if (tagsModified) {
                console.debug(`Tags modified for task ${lineTask_todoist_id}`)
                updatedContent.labels = lineTask.labels
                tagsChanged = true;
            }


            if (dueDateModified) {
                console.debug(`Due date modified for task ${lineTask_todoist_id}`)
                console.debug(lineTask.dueDate)
                //console.debug(savedTask.due.date)
                if(lineTask.dueDate === ""){
                    updatedContent.dueString = "no date"
                }else{
                    updatedContent.dueDate = lineTask.dueDate
                }

                dueDateChanged = true;
            }

            //todoist Rest API does not have move task to new project functionality
            if (projectModified) {
                //console.debug(`Project id modified for task ${lineTask_todoist_id}`)
                //updatedContent.projectId = lineTask.projectId
                //projectChanged = false;
            }

            //todoist Rest API does not have an endpoint for modifying parent id
            if (parentIdModified) {
                //console.debug(`Parnet id modified for task ${lineTask_todoist_id}`)
                //updatedContent.parentId = lineTask.parentId
                //parentIdChanged = false;
            }

            if (priorityModified) {

                updatedContent.priority = lineTask.priority
                priorityChanged = true;
            }


            if (contentChanged || tagsChanged ||dueDateChanged ||projectChanged || parentIdChanged || priorityChanged) {
                //console.debug("task content was modified");
                //console.debug(updatedContent)
                const updatedTask = await this.plugin.todoistRestAPI!.UpdateTask(lineTask.todoist_id!.toString(),updatedContent)
                Object.assign(updatedTask, { path: filepath });
                this.plugin.cacheOperation!.updateTaskToCacheByID(updatedTask);
            }

            if (statusModified) {
                console.debug(`Status modified for task ${lineTask_todoist_id}`)
                if (lineTask.isCompleted === true) {
                console.debug(`task completed`)
                await this.plugin.todoistRestAPI!.CloseTask(lineTask.todoist_id!.toString());
                this.plugin.cacheOperation!.closeTaskToCacheByID( lineTask.todoist_id!.toString());
                } else {
                console.debug(`task umcompleted`)
                await this.plugin.todoistRestAPI!.OpenTask(lineTask.todoist_id!.toString());
                this.plugin.cacheOperation!.reopenTaskToCacheByID( lineTask.todoist_id!.toString());
                }

                statusChanged = true;
            }



            if (contentChanged || statusChanged ||dueDateChanged ||tagsChanged || projectChanged || priorityChanged) {
                console.debug(lineTask)
                console.debug(savedTask)
                //`Task ${lastLineTaskTodoistId} was modified`
                void this.plugin.saveSettings()
                let message = `Task ${lineTask_todoist_id} is updated.`;

                if (contentChanged) {
                    message += " Content was changed.";
                }
                if (statusChanged) {
                    message += " Status was changed.";
                }
                if (dueDateChanged) {
                    message += " Due date was changed.";
                }
                if (tagsChanged) {
                    message += " Tags were changed.";
                }
                if (projectChanged) {
                    message += " Project was changed.";
                }
                if (priorityChanged) {
                    message += " Priority was changed.";
                }

                new Notice(message);

            } else {
                //console.debug(`Task ${lineTask_todoist_id} did not change`);
            }

            } catch (error) {
            console.error('Error updating task:', error);
            }


        }
    }


    async fullTextModifiedTaskCheck(file_path: string): Promise<void> {

        let file;
        let currentFileValue;
        let view;
        let filepath;

        try {
          if (file_path) {
            const abstractFile = this.app.vault.getAbstractFileByPath(file_path);
            if (!(abstractFile instanceof TFile)) return;
            file = abstractFile;
            filepath = file_path;
            currentFileValue = await this.app.vault.read(file);
          } else {
            view = this.app.workspace.getActiveViewOfType(MarkdownView);
            file = this.app.workspace.getActiveFile();
            filepath = file?.path;
            currentFileValue = view?.data;
          }

          const content = currentFileValue!;

          let hasModifiedTask = false;
          const lines = content.split('\n');

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (this.plugin.taskParser!.hasTodoistId(line) && this.plugin.taskParser!.hasTodoistTag(line)) {
              try {
                await this.lineModifiedTaskCheck(filepath!, line, i, content);
                hasModifiedTask = true;
              } catch (error) {
                console.error('Error modifying task:', error);
                continue;
              }
            }
          }

          if (hasModifiedTask) {
            try {
              // Perform necessary actions on the modified content and front matter
            } catch (error) {
              console.error('Error processing modified content:', error);
            }
          }
        } catch (error) {
          console.error('Error:', error);
        }
      }


    // Close a task by calling API and updating JSON file
    async closeTask(taskId: string): Promise<void> {
    try {
        await this.plugin.todoistRestAPI!.CloseTask(taskId);
        await this.plugin.fileOperation!.completeTaskInTheFile(taskId)
        this.plugin.cacheOperation!.closeTaskToCacheByID(taskId);
        void this.plugin.saveSettings()
        new Notice(`Task ${taskId} is closed.`)
    } catch (error) {
        console.error('Error closing task:', error);
        throw error; // throw error so caller can catch and handle it
    }
    }

    //open task
    async repoenTask(taskId:string) : Promise<void>{
        try {
            await this.plugin.todoistRestAPI!.OpenTask(taskId)
            await this.plugin.fileOperation!.uncompleteTaskInTheFile(taskId)
            this.plugin.cacheOperation!.reopenTaskToCacheByID(taskId)
            void this.plugin.saveSettings()
            new Notice(`Task ${taskId} is reopened.`)
        } catch (error) {
            console.error('Error opening task:', error);
            throw error; // throw error so caller can catch and handle it
        }
    }


    /**
     * Delete tasks with specified IDs from the task list and update the JSON file
     * @param taskIds array of task IDs to delete
     * @returns array of successfully deleted task IDs
     */
    async deleteTasksByIds(taskIds: string[]): Promise<string[]> {
    const deletedTaskIds = [];

    for (const taskId of taskIds) {
        const api = this.plugin.todoistRestAPI!.initializeAPI()
        try {
        const response = await api.deleteTask(taskId);
        console.debug(`response is ${response}`);

        if (response) {
            //console.debug(`Task ${taskId} deleted successfully`);
            new Notice(`Task ${taskId} is deleted.`)
            deletedTaskIds.push(taskId); // add deleted task ID to array
        }
        } catch (error) {
        console.error(`Failed to delete task ${taskId}: ${error}`);
        // could add better error handling here, such as throwing an exception or logging
        }
    }

    if (!deletedTaskIds.length) {
        console.debug("no tasks deleted");
        return [];
    }

    this.plugin.cacheOperation!.deleteTaskFromCacheByIDs(deletedTaskIds); // update JSON file
    void this.plugin.saveSettings()
    //console.debug(`deleted ${deletedTaskIds.length} tasks in total`);


    return deletedTaskIds;
    }









    // sync completed task status to Obsidian file
    async  syncCompletedTaskStatusToObsidian(unSynchronizedEvents: SyncEvent[]) {
        // get unsynced events
        //console.debug(unSynchronizedEvents)
        try {

        // process unsynced events and wait for all to complete
        const processedEvents = []
        for (const e of unSynchronizedEvents) {   //to execute completeTaskInTheFile(e.objectId) sequentially, replace Promise.allSettled() with a for...of loop to process unsynced events
            //console.debug(`completing ${e.objectId}`)
            await this.plugin.fileOperation!.completeTaskInTheFile(e.objectId)
            this.plugin.cacheOperation!.closeTaskToCacheByID(e.objectId)
            new Notice(`Task ${e.objectId} is closed.`)
            processedEvents.push(e)
        }

        // Save events to the local database."
        //const allEvents = [...savedEvents, ...unSynchronizedEvents]
        this.plugin.cacheOperation!.appendEventsToCache(processedEvents)
        void this.plugin.saveSettings()





        } catch (error) {
        console.error('Error syncing task status:', error)
        }
    }


    // sync uncompleted task status to Obsidian file
    async  syncUncompletedTaskStatusToObsidian(unSynchronizedEvents: SyncEvent[]) {

        //console.debug(unSynchronizedEvents)

        try {

        // process unsynced events and wait for all to complete
        const processedEvents = []
        for (const e of unSynchronizedEvents) {   //to execute uncompleteTaskInTheFile(e.objectId) sequentially, replace Promise.allSettled() with a for...of loop to process unsynced events
            //console.debug(`unchecking task: ${e.objectId}`)
            await this.plugin.fileOperation!.uncompleteTaskInTheFile(e.objectId)
            this.plugin.cacheOperation!.reopenTaskToCacheByID(e.objectId)
            new Notice(`Task ${e.objectId} is reopened.`)
            processedEvents.push(e)
        }



        // merge new events into existing events and save to JSON
        //const allEvents = [...savedEvents, ...unSynchronizedEvents]
        this.plugin.cacheOperation!.appendEventsToCache(processedEvents)
        void this.plugin.saveSettings()
        } catch (error) {
        console.error('Error syncing task status:', error)
        }
    }

    // sync updated item status to Obsidian
    async  syncUpdatedTaskToObsidian(unSynchronizedEvents: SyncEvent[]) {
        //console.debug(unSynchronizedEvents)
        try {

        // process unsynced events and wait for all to complete
        const processedEvents = []
        for (const e of unSynchronizedEvents) {   //to execute completeTaskInTheFile(e.objectId) sequentially, replace Promise.allSettled() with a for...of loop to process unsynced events
            //console.debug(`syncing changes for ${e.objectId} to local`)
            console.debug(e)
            console.debug(typeof e.extraData.last_due_date === 'undefined')
            if(!(typeof e.extraData.last_due_date === 'undefined')){
                //console.debug(`prepare update dueDate`)
                await this.syncUpdatedTaskDueDateToObsidian(e)

            }

            if(!(typeof e.extraData.last_content === 'undefined')){
                //console.debug(`prepare update content`)
                await this.syncUpdatedTaskContentToObsidian(e)
            }

            //await this.plugin.fileOperation.syncUpdatedTaskToTheFile(e)
            //also update data in cache
            //new Notice(`Task ${e.objectId} is updated.`)
            processedEvents.push(e)
        }



        // merge new events into existing events and save to JSON
        //const allEvents = [...savedEvents, ...unSynchronizedEvents]
        this.plugin.cacheOperation!.appendEventsToCache(processedEvents)
        void this.plugin.saveSettings()
        } catch (error) {
        console.error('Error syncing updated item:', error)
        }

    }

    async syncUpdatedTaskContentToObsidian(e: SyncEvent){
        await this.plugin.fileOperation!.syncUpdatedTaskContentToTheFile(e)
        const content = e.extraData.content as string
        this.plugin.cacheOperation!.modifyTaskToCacheByID(e.objectId,{content})
        new Notice(`The content of Task ${e.parentItemId} has been modified.`)

    }

    async syncUpdatedTaskDueDateToObsidian(e: SyncEvent){
        await this.plugin.fileOperation!.syncUpdatedTaskDueDateToTheFile(e)
        //update cache date, use todoist format
        const due = await this.plugin.todoistRestAPI!.getTaskDueById(e.objectId)
        this.plugin.cacheOperation!.modifyTaskToCacheByID(e.objectId,{ due: due ?? undefined })
        new Notice(`The due date of Task ${e.parentItemId} has been modified.`)

    }

    // sync added task note to obsidian
    async  syncAddedTaskNoteToObsidian(unSynchronizedEvents: SyncEvent[]) {
        // get unsynced events
        //console.debug(unSynchronizedEvents)
        try {

        // process unsynced events and wait for all to complete
        const processedEvents = []
        for (const e of unSynchronizedEvents) {   //to execute completeTaskInTheFile(e.objectId) sequentially, replace Promise.allSettled() with a for...of loop to process unsynced events
            console.debug(e)
            //const taskid = e.parentItemId
            //const note = e.extraData.content
            await this.plugin.fileOperation!.syncAddedTaskNoteToTheFile(e)
            //await this.plugin.cacheOperation.closeTaskToCacheByID(e.objectId)
            new Notice(`Task ${e.parentItemId} note is added.`)
            processedEvents.push(e)
        }

        // merge new events into existing events and save to JSON

        this.plugin.cacheOperation!.appendEventsToCache(processedEvents)
        void this.plugin.saveSettings()
        } catch (error) {
        console.error('Error syncing task status:', error)
        }
    }


    async syncTodoistToObsidian(){
        try{
            const all_activity_events = await this.plugin.todoistSyncAPI!.getNonObsidianAllActivityEvents()
            if(!all_activity_events){
                console.debug('No activity events returned')
                return
            }

            if(this.plugin.settings.debugMode){
                console.debug(`syncTodoistToObsidian: ${all_activity_events.length} activity events fetched`)
                if(all_activity_events.length > 0){
                    console.debug('First event sample:', JSON.stringify(all_activity_events[0]))
                }
            }

            // remove synchonized events
            const savedEvents = this.plugin.cacheOperation!.loadEventsFromCache()
            const result1 = all_activity_events.filter(
            (objA: SyncEvent) => !savedEvents.some((objB: SyncEvent) => objB.id === objA.id)
            )

            if(this.plugin.settings.debugMode){
                console.debug(`syncTodoistToObsidian: ${result1.length} new (unsynced) events after filtering ${savedEvents.length} cached events`)
            }

            const savedTasks = this.plugin.cacheOperation!.loadTasksFromCache()
            // find task activities where task id exists in Obsidian
            const result2 = result1.filter(
            (objA: SyncEvent) => savedTasks.some((objB: TodoistTask) => objB.id === objA.objectId)
            )

            if(this.plugin.settings.debugMode){
                console.debug(`syncTodoistToObsidian: ${result2.length} events matching ${savedTasks.length} cached tasks`)
                if(result1.length > 0 && result2.length === 0){
                    console.debug('Event objectIds:', result1.map((e: SyncEvent) => e.objectId))
                    console.debug('Cached task ids:', savedTasks.map((t: TodoistTask) => t.id))
                }
            }
            // find note activities where task id exists in Obsidian
            const result3 = result1.filter(
                (objA: SyncEvent) => savedTasks.some((objB: TodoistTask) => objB.id === objA.parentItemId)
                )




            const unsynchronized_item_completed_events = this.plugin.todoistSyncAPI!.filterActivityEvents(result2, { eventType: 'completed', objectType: 'task' })
            const unsynchronized_item_uncompleted_events = this.plugin.todoistSyncAPI!.filterActivityEvents(result2, { eventType: 'uncompleted', objectType: 'task' })

            //Items updated (only changes to content, description, due_date and responsible_uid)
            const unsynchronized_item_updated_events = this.plugin.todoistSyncAPI!.filterActivityEvents(result2, { eventType: 'updated', objectType: 'task' })

            const unsynchronized_notes_added_events = this.plugin.todoistSyncAPI!.filterActivityEvents(result3, { eventType: 'added', objectType: 'comment' })
            const unsynchronized_project_events = this.plugin.todoistSyncAPI!.filterActivityEvents(result1, { objectType: 'project' })
            console.debug(unsynchronized_item_completed_events)
            console.debug(unsynchronized_item_uncompleted_events)
            console.debug(unsynchronized_item_updated_events)
            console.debug(unsynchronized_project_events)
            console.debug(unsynchronized_notes_added_events)

            await this.syncCompletedTaskStatusToObsidian(unsynchronized_item_completed_events)
            await this.syncUncompletedTaskStatusToObsidian(unsynchronized_item_uncompleted_events)
            await this.syncUpdatedTaskToObsidian(unsynchronized_item_updated_events)
            await this.syncAddedTaskNoteToObsidian(unsynchronized_notes_added_events)
            if(unsynchronized_project_events.length){
                console.debug('New project event')
                await this.plugin.cacheOperation!.saveProjectsToCache()
                this.plugin.cacheOperation!.appendEventsToCache(unsynchronized_project_events)
            }


        }catch (err){
            console.error('An error occurred while synchronizing:', err);
        }

    }



    async  backupTodoistAllResources() {
        try {
        const resources = await this.plugin.todoistSyncAPI!.getAllResources()

        const now: Date = new Date();
        const timeString: string = `${now.getFullYear()}${now.getMonth()+1}${now.getDate()}${now.getHours()}${now.getMinutes()}${now.getSeconds()}`;

        const name = "todoist-backup-"+timeString+".json"

        await this.app.vault.create(name,JSON.stringify(resources))
        //console.debug(`todoist backup successful`)
        new Notice(`Todoist backup data is saved in the path ${name}`)
        } catch (error) {
        console.error("An error occurred while creating Todoist backup:", error);
        }

    }


    //After renaming the file, check all tasks in the file and update all links.
    async updateTaskDescription(filepath:string){
        const metadata = this.plugin.cacheOperation!.getFileMetadata(filepath)
        if(!metadata || !metadata.todoistTasks){
            return
        }
        const description = this.plugin.taskParser!.getObsidianUrlFromFilepath(filepath)
        const updatedContent: Record<string, unknown> = {}
        updatedContent.description = description
        try {
            for (const taskId of metadata.todoistTasks) {
                const updatedTask = await this.plugin.todoistRestAPI!.UpdateTask(taskId,updatedContent)
                Object.assign(updatedTask, { path: filepath });
                this.plugin.cacheOperation!.updateTaskToCacheByID(updatedTask as TodoistTask);
            }
        } catch(error) {
            console.error('An error occurred in updateTaskDescription:', error);
        }



    }





}
