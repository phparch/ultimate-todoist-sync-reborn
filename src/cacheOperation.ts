import { App} from 'obsidian';
import UltimateTodoistSyncForObsidian from "../main";

interface Due {
    date?: string;
    [key: string]: any; // allow for additional properties
  }

export class CacheOperation   {
	app:App;
    plugin: UltimateTodoistSyncForObsidian;

	constructor(app:App, plugin: UltimateTodoistSyncForObsidian) {
		//super(app,settings);
		this.app = app;
        this.plugin = plugin;
	}

          
      
      
      
    async getFileMetadata(filepath:string) {
        return this.plugin.settings.fileMetadata[filepath] ?? null
    }

    async getFileMetadatas(){
        return this.plugin.settings.fileMetadata ?? null
    }

    async newEmptyFileMetadata(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if(metadatas[filepath]) {
            return
        }
        else{
            metadatas[filepath] = {}
        }
        metadatas[filepath].todoistTasks = [];
        metadatas[filepath].todoistCount = 0;
        // save updated metadatas object back to settings
        this.plugin.settings.fileMetadata = metadatas

    }

    async updateFileMetadata(filepath:string,newMetadata: any) {
        const metadatas = this.plugin.settings.fileMetadata
    
        // if metadata object doesn't exist, create a new one and add to metadatas
        if (!metadatas[filepath]) {
            metadatas[filepath] = {}
        }
    
        // update property values in metadata object
        metadatas[filepath].todoistTasks = newMetadata.todoistTasks;
        metadatas[filepath].todoistCount = newMetadata.todoistCount;
    
        // save updated metadatas object back to settings
        this.plugin.settings.fileMetadata = metadatas

    }

    async deleteTaskIdFromMetadata(filepath:string,taskId:string){
        console.log(filepath)
        const metadata = await this.getFileMetadata(filepath)
        console.log(metadata)
        const newTodoistTasks = metadata.todoistTasks.filter(function(element: any){
            return element !== taskId
        })
        const newTodoistCount = metadata.todoistCount - 1
        let newMetadata: any = {}
        newMetadata.todoistTasks = newTodoistTasks
        newMetadata.todoistCount = newTodoistCount
        console.log(`new metadata ${newMetadata}`)
        

    }

    //delete filepath from filemetadata
    async deleteFilepathFromMetadata(filepath:string){
        Reflect.deleteProperty(this.plugin.settings.fileMetadata, filepath);
        this.plugin.saveSettings()
        console.log(`${filepath} is deleted from file metadatas.`)
    }


    //Check errors in filemata where the filepath is incorrect.
    async checkFileMetadata(){
        const metadatas =  await this.getFileMetadatas()
        for (const key in metadatas) {
            let filepath = key
            const value = metadatas[key];
            let file = this.app.vault.getAbstractFileByPath(key)
            if(!file && (value.todoistTasks?.length === 0 || !value.todoistTasks)){
                console.log(`${key} is not existed and metadata is empty.`)
                await this.deleteFilepathFromMetadata(key)
                continue
            }
            if(value.todoistTasks?.length === 0 || !value.todoistTasks){
                //todo 
                //delelte empty metadata
                continue
            }
            //check if file exist
            
            if(!file){
                //search new filepath
                console.log(`file ${filepath} is not exist`) 
                const todoistId1 = value.todoistTasks[0]
                console.log(todoistId1)
                const searchResult = await this.plugin.fileOperation!.searchFilepathsByTaskidInVault(todoistId1)
                console.log(`new file path is`)
                console.log(searchResult)

                //update metadata
                await this.updateRenamedFilePath(filepath,searchResult!)
                this.plugin.saveSettings()

            }


            //const fileContent = await this.app.vault.read(file)
            //check if file include all tasks


            /*
            value.todoistTasks.forEach(async(taskId) => {
                const taskObject = await this.plugin.cacheOperation.loadTaskFromCacheyID(taskId)


            });
            */
          }
    
    }

    getDefaultProjectNameForFilepath(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectName
        }
        else{
            const defaultProjectId = metadatas[filepath].defaultProjectId
            const defaultProjectName = this.getProjectNameByIdFromCache(defaultProjectId)
            return defaultProjectName
        }
    }


    getDefaultProjectIdForFilepath(filepath:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath] || metadatas[filepath].defaultProjectId === undefined) {
            return this.plugin.settings.defaultProjectId
        }
        else{
            const defaultProjectId = metadatas[filepath].defaultProjectId
            return defaultProjectId
        }
    }

    setDefaultProjectIdForFilepath(filepath:string,defaultProjectId:string){
        const metadatas = this.plugin.settings.fileMetadata
        if (!metadatas[filepath]) {
            metadatas[filepath] = {}
        }
        metadatas[filepath].defaultProjectId = defaultProjectId
    
        // save updated metadatas object back to settings
        this.plugin.settings.fileMetadata = metadatas

    }


    // load all tasks from cache
    loadTasksFromCache() {
    try {
        const savedTasks = this.plugin.settings.todoistTasksData.tasks
        return savedTasks;
    } catch (error) {
        console.error(`Error loading tasks from Cache: ${error}`);
        return [];
    }
    }
      

    // overwrite and save all tasks to cache
    saveTasksToCache(newTasks: any) {
        try {
            this.plugin.settings.todoistTasksData.tasks = newTasks
            
        } catch (error) {
            console.error(`Error saving tasks to Cache: ${error}`);
            return false;
        }
    }
      
      
      
      
    // append event to cache
    appendEventToCache(event:Object[]) {
        try {
            this.plugin.settings.todoistTasksData.events.push(event)
        } catch (error) {
            console.error(`Error append event to Cache: ${error}`);
        }
    }

    // append events to cache
    appendEventsToCache(events:Object[]) {
        try {
            this.plugin.settings.todoistTasksData.events.push(...events)
        } catch (error) {
            console.error(`Error append events to Cache: ${error}`);
        }
    }
      
      
    // load all events from cache
    loadEventsFromCache() {
    try {

            const savedEvents = this.plugin.settings.todoistTasksData.events
            return savedEvents;
        } catch (error) {
            console.error(`Error loading events from Cache: ${error}`);
        }
    }


      
    // append to cache
    appendTaskToCache(task: any) {
        try {
            if(task === null){
                return
            }
            const savedTasks = this.plugin.settings.todoistTasksData.tasks
            //const taskAlreadyExists = savedTasks.some((t) => t.id === task.id);
            //if (!taskAlreadyExists) {
             // When using the push method to insert a string into a cache object, it is treated as a simple key-value pair where the key is the array's numeric index and the value is the string itself. However, if you use push to insert another cache object (or array) into the cache object, that object becomes a nested child of the original cache object. In this case, the key is the numeric index and the value is the nested cache object itself.
            //}
            this.plugin.settings.todoistTasksData.tasks.push(task);  
        } catch (error) {
            console.error(`Error appending task to Cache: ${error}`);
        }
    }
      
      
      
      
    //load task by specified id
    loadTaskFromCacheyID(taskId: any) {
        try {

            const savedTasks = this.plugin.settings.todoistTasksData.tasks
            //console.log(savedTasks)
            const savedTask = savedTasks.find((t: any) => t.id === taskId);
            //console.log(savedTask)
            return(savedTask)
        } catch (error) {
            console.error(`Error finding task from Cache: ${error}`);
            return [];
        }
    }
      
    //overwrite update task by specified id
    updateTaskToCacheByID(task: any) {
        try {
        
        
            //delete the old task
            this.deleteTaskFromCache(task.id)
            //add the new task
            this.appendTaskToCache(task)
        
        } catch (error) {
            console.error(`Error updating task to Cache: ${error}`);
            return [];
        }
    }

    //due structure  {date: "2025-02-25",isRecurring: false,lang: "en",string: "2025-02-25"}



    modifyTaskToCacheByID(taskId: string, { content, due }: { content?: string, due?: Due }): void {
        try {
          const savedTasks = this.plugin.settings.todoistTasksData.tasks;
          const taskIndex = savedTasks.findIndex((task: any) => task.id === taskId);
      
          if (taskIndex !== -1) {
            const updatedTask = { ...savedTasks[taskIndex] };
            
            if (content !== undefined) {
              updatedTask.content = content;
            }
      
            if (due !== undefined) {
              if (due === null) {
                updatedTask.due = null;
              } else {
                updatedTask.due = due;
              }
            }
      
            savedTasks[taskIndex] = updatedTask;
      
            this.plugin.settings.todoistTasksData.tasks = savedTasks;
          } else {
            throw new Error(`Task with ID ${taskId} not found in cache.`);
          }
        } catch (error) {
          // Handle the error appropriately, e.g. by logging it or re-throwing it.
        }
      }
      
      
      //open a task status
    reopenTaskToCacheByID(taskId:string) {
        try {
            const savedTasks = this.plugin.settings.todoistTasksData.tasks

        
            // iterate through array to find item with specified ID
            for (let i = 0; i < savedTasks.length; i++) {
            if (savedTasks[i].id === taskId) {
                // modify object properties
                savedTasks[i].isCompleted = false;
                savedTasks[i].checked = false;
                break; // found and modified the item, exit loop
            }
            }
            this.plugin.settings.todoistTasksData.tasks = savedTasks
        
        } catch (error) {
            console.error(`Error open task to Cache file: ${error}`);
            return [];
        }
    }
      
      
      
    //close a task status
    closeTaskToCacheByID(taskId:string):void {
        try {
            const savedTasks = this.plugin.settings.todoistTasksData.tasks
        
            // iterate through array to find item with specified ID
            for (let i = 0; i < savedTasks.length; i++) {
            if (savedTasks[i].id === taskId) {
                // modify object properties
                savedTasks[i].isCompleted = true;
                savedTasks[i].checked = true;
                break; // found and modified the item, exit loop
            }
            }
            this.plugin.settings.todoistTasksData.tasks = savedTasks
        
        } catch (error) {
            console.error(`Error close task to Cache file: ${error}`);
            throw error; // throw error so caller can catch and handle it
        }
    }
      
      
    // delete task by ID
    deleteTaskFromCache(taskId: any) {
        try {
        const savedTasks = this.plugin.settings.todoistTasksData.tasks
        const newSavedTasks = savedTasks.filter((t: any) => t.id !== taskId);

        this.plugin.settings.todoistTasksData.tasks = newSavedTasks                                         
        } catch (error) {
        console.error(`Error deleting task from Cache file: ${error}`);
        }
    }
      
      
      
      
      
    // delete tasks by ID array
    deleteTaskFromCacheByIDs(deletedTaskIds: any) {
        try {
            const savedTasks = this.plugin.settings.todoistTasksData.tasks
            const newSavedTasks = savedTasks.filter((t: any) => !deletedTaskIds.includes(t.id))
            this.plugin.settings.todoistTasksData.tasks = newSavedTasks
        } catch (error) {
            console.error(`Error deleting task from Cache : ${error}`);
        }
    }
      
      
    //find project id by name
    getProjectIdByNameFromCache(projectName:string) {
        try {
        const savedProjects = this.plugin.settings.todoistTasksData.projects
        const targetProject = savedProjects.find((obj: any) => obj.name === projectName);
        const projectId = targetProject ? targetProject.id : null;
        return(projectId)
        } catch (error) {
        console.error(`Error finding project from Cache file: ${error}`);
        return(false)
        }
    }


     
    getProjectNameByIdFromCache(projectId:string) {
        try {
        const savedProjects = this.plugin.settings.todoistTasksData.projects
        const targetProject = savedProjects.find((obj: any) => obj.id === projectId);
        const projectName = targetProject ? targetProject.name : null;
        return(projectName)
        } catch (error) {
        console.error(`Error finding project from Cache file: ${error}`);
        return(false)
        }
    }
      


    //save projects data to json file
    async saveProjectsToCache() {
        try{
                //get projects
            const projects = await this.plugin.todoistRestAPI!.GetAllProjects()
            if(!projects){
                return false
            }
        
            //save to json
            this.plugin.settings.todoistTasksData.projects = projects

            return true

        }catch(error){
            return false
            console.log(`error downloading projects: ${error}`)

    }
    
    }


    async updateRenamedFilePath(oldpath:string,newpath:string){
        try{
            console.log(`oldpath is ${oldpath}`)
            console.log(`newpath is ${newpath}`)
            const savedTask = await this.loadTasksFromCache()
            //console.log(savedTask)
            const newTasks = savedTask.map((obj: any) => {
                if (obj.path === oldpath) {
                  return { ...obj, path: newpath };
                }else {
                    return obj;
                }
            })
            //console.log(newTasks)
            await this.saveTasksToCache(newTasks)

            //update filepath
            const fileMetadatas = this.plugin.settings.fileMetadata
            fileMetadatas[newpath] = fileMetadatas[oldpath]
            delete fileMetadatas[oldpath]
            this.plugin.settings.fileMetadata = fileMetadatas

        }catch(error){
            console.log(`Error updating renamed file path to cache: ${error}`)
        }


    }

}
