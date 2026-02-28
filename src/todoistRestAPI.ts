import { TodoistApi } from "@doist/todoist-api-typescript"
import type { Task, PersonalProject, WorkspaceProject, AddTaskArgs, UpdateTaskArgs, GetTasksArgs, GetTasksResponse, GetProjectsArgs, GetProjectsResponse, CustomFetch } from "@doist/todoist-api-typescript"
import { App} from 'obsidian';
import UltimateTodoistSyncForObsidian from "../main";
import { obsidianFetch } from "./obsidianFetchAdapter";

    //convert date from obsidian event
    // usage example
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDatetimeString(str);
    //console.log(dateStr); // outputs 2023-03-27T00:00:00.000Z
function  localDateStringToUTCDatetimeString(localDateString:string) {
        try {
          if(localDateString === null){
            return null
          }
          localDateString = localDateString + "T08:00";
          let localDateObj = new Date(localDateString);
          let ISOString = localDateObj.toISOString()
          return(ISOString);
        } catch (error) {
          console.error(`Error extracting date from string '${localDateString}': ${error}`);
          return null;
        }
}

function omitNullValues(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

export class TodoistRestAPI  {
	app:App;
  plugin: UltimateTodoistSyncForObsidian;

	constructor(app:App, plugin:UltimateTodoistSyncForObsidian) {
		//super(app,settings);
		this.app = app;
    this.plugin = plugin;
	}


    initializeAPI(){
        const token = this.plugin.settings.todoistAPIToken
        const api = new TodoistApi(token, { customFetch: obsidianFetch as unknown as CustomFetch })
        return(api)
    }

    async AddTask({ projectId, content, parentId, dueDate, dueDatetime,labels, description,priority }: { projectId: string, content: string, parentId?: string , dueDate?: string,dueDatetime?: string, labels?: Array<string>, description?: string,priority?:number }) {
        const api = this.initializeAPI()
        try {
          if(dueDate && !dueDatetime){
            dueDatetime = localDateStringToUTCDatetimeString(dueDate) ?? undefined
            dueDate = undefined
          }
          const taskData = omitNullValues({
            projectId,
            content,
            parentId,
            dueDate,
            dueDatetime,
            labels,
            description,
            priority
          });
          if(this.plugin.settings.debugMode) console.debug('AddTask: calling api.addTask with', taskData)
          const newTask = await api.addTask(taskData as AddTaskArgs);
          if(this.plugin.settings.debugMode) console.debug('AddTask: response', newTask)
          return newTask;
        } catch (error) {
          throw new Error(`Error adding task: ${(error as Error).message}`);
        }
    }


    //options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}
    async GetActiveTasks(options:{ projectId?: string, section_id?: string, label?: string , filter?: string,lang?: string, ids?: Array<string>}) {
      const api = this.initializeAPI()
      try {
        const result = await api.getTasks(options as GetTasksArgs);
        if (Array.isArray(result)) {
          return result;
        }
        // v6 SDK returns { results, nextCursor } for paginated responses
        const allTasks: Task[] = [];
        let response = result as GetTasksResponse;
        allTasks.push(...(response.results || []));
        while (response.nextCursor) {
          response = await api.getTasks({ ...options, cursor: response.nextCursor } as GetTasksArgs) as GetTasksResponse;
          if (Array.isArray(response)) {
            allTasks.push(...response);
            break;
          }
          allTasks.push(...(response.results || []));
        }
        return allTasks;
      } catch (error) {
        throw new Error(`Error get active tasks: ${(error as Error).message}`);
      }
    }


    //Also note that to remove the due date of a task completely, you should set the due_string parameter to no date or no due date.
    //API does not have a function to update task project id
    async UpdateTask(taskId: string, updates: { content?: string, description?: string, labels?:Array<string>,dueDate?: string,dueDatetime?: string,dueString?:string,parentId?:string,priority?:number }) {
        const api = this.initializeAPI()
        if (!taskId) {
        throw new Error('taskId is required');
        }
        if (!updates.content && !updates.description &&!updates.dueDate && !updates.dueDatetime && !updates.dueString && !updates.labels &&!updates.parentId && !updates.priority) {
        throw new Error('At least one update is required');
        }
        try {
        if(updates.dueDate){
            console.debug(updates.dueDate)
            updates.dueDatetime = localDateStringToUTCDatetimeString(updates.dueDate) ?? undefined
            updates.dueDate = undefined
            console.debug(updates.dueDatetime)
          }
        const cleanUpdates = omitNullValues(updates);
        const updatedTask = await api.updateTask(taskId, cleanUpdates as UpdateTaskArgs);
        return updatedTask;
        } catch (error) {
        throw new Error(`Error updating task: ${(error as Error).message}`);
        }
    }



    //open a task
    async OpenTask(taskId:string) {
        const api = this.initializeAPI()
        try {

        const isSuccess = await api.reopenTask(taskId);
        console.debug(`Task ${taskId} is reopened`)
        return(isSuccess)

        } catch (error) {
            console.error('Error open a  task:', error);
            return
        }
    }

    // Close a task in Todoist API
    async CloseTask(taskId: string): Promise<boolean> {
        const api = this.initializeAPI()
        try {
        const isSuccess = await api.closeTask(taskId);
        console.debug(`Task ${taskId} is closed`)
        return isSuccess;
        } catch (error) {
        console.error('Error closing task:', error);
        throw error; // throw error so caller can catch and handle it
        }
    }



    // get a task by Id
    async getTaskById(taskId: string) {
        const api = this.initializeAPI()
        if (!taskId) {
        throw new Error('taskId is required');
        }
        try {
        const task = await api.getTask(taskId);
        return task;
        } catch (error) {
          if (error instanceof Error && 'response' in error) {
            const resp = (error as { response: { status: number } }).response;
            throw new Error(`Error retrieving task. Status code: ${resp.status}`);
          }
          throw new Error(`Error retrieving task: ${(error as Error).message}`);
        }
    }

    //get a task due by id
    async getTaskDueById(taskId: string) {
        const api = this.initializeAPI()
        if (!taskId) {
        throw new Error('taskId is required');
        }
        try {
        const task = await api.getTask(taskId);
        const due = task.due ?? null
        return due;
        } catch (error) {
        throw new Error(`Error updating task: ${(error as Error).message}`);
        }
    }


    //get all projects
    async GetAllProjects() {
        const api = this.initializeAPI()
        try {
        const result = await api.getProjects();
        if (Array.isArray(result)) {
          return result;
        }
        // v6 SDK returns { results, nextCursor } for paginated responses
        const allProjects: (PersonalProject | WorkspaceProject)[] = [];
        let response = result as GetProjectsResponse;
        allProjects.push(...(response.results || []));
        while (response.nextCursor) {
          response = await api.getProjects({ cursor: response.nextCursor } as GetProjectsArgs) as GetProjectsResponse;
          if (Array.isArray(response)) {
            allProjects.push(...response);
            break;
          }
          allProjects.push(...(response.results || []));
        }
        return allProjects;

        } catch (error) {
            console.error('Error get all projects', error);
            return false
        }
    }


}
