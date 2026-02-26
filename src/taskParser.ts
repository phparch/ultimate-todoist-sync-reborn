import { App} from 'obsidian';
import UltimateTodoistSyncForObsidian from "../main";




interface dataviewTaskObject {
    status: string;
    checked: boolean;
    completed: boolean;
    fullyCompleted: boolean;
    text: string;
    visual: string;
    line: number;
    lineCount: number;
    path: string;
    section: string;
    tags: string[];
    outlinks: string[];
    link: string;
    children: any[];
    task: boolean;
    annotated: boolean;
    parent: number;
    blockId: string;
}
  
  
interface todoistTaskObject {
    content: string;
    description?: string;
    project_id?: string;
    section_id?: string;
    parent_id?: string;
    order?: number | null;
    labels?: string[];
    priority?: number | null;
    due_string?: string;
    due_date?: string;
    due_datetime?: string;
    due_lang?: string;
    assignee_id?: string;
}
  

const keywords = {
    TODOIST_TAG: "#todoist",
    DUE_DATE: "🗓️|📅|📆|🗓",
};

const REGEX = {
    TODOIST_TAG: new RegExp(`^[\\s]*[-] \\[[x ]\\] [\\s\\S]*${keywords.TODOIST_TAG}[\\s\\S]*$`, "i"),
    TODOIST_ID: /\[todoist_id::\s*[\w]+\]/,
    TODOIST_ID_NUM:/\[todoist_id::\s*(.*?)\]/,
    TODOIST_LINK:/\[link\]\(.*?\)/,
    DUE_DATE_WITH_EMOJ: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`),
    DUE_DATE : new RegExp(`(?:${keywords.DUE_DATE})\\s?(\\d{4}-\\d{2}-\\d{2})`),
    PROJECT_NAME: /\[project::\s*(.*?)\]/,
    TASK_CONTENT: {
        REMOVE_PRIORITY: /\s!!([1-4])\s/,
        REMOVE_TAGS: /(^|\s)(#[a-zA-Z\d\u4e00-\u9fa5-]+)/g,
        REMOVE_SPACE: /^\s+|\s+$/g,
        REMOVE_DATE: new RegExp(`(${keywords.DUE_DATE})\\s?\\d{4}-\\d{2}-\\d{2}`),
        REMOVE_INLINE_METADATA: /%%\[\w+::\s*\w+\]%%/,
        REMOVE_CHECKBOX:  /^(-|\*)\s+\[(x|X| )\]\s/,
        REMOVE_CHECKBOX_WITH_INDENTATION: /^([ \t]*)?(-|\*)\s+\[(x|X| )\]\s/,
        REMOVE_TODOIST_LINK: /\[link\]\(.*?\)/,
    },
    ALL_TAGS: /#[\w\u4e00-\u9fa5-]+/g,
    TASK_CHECKBOX_CHECKED: /- \[(x|X)\] /,
    TASK_INDENTATION: /^(\s{2,}|\t)(-|\*)\s+\[(x|X| )\]/,
    TAB_INDENTATION: /^(\t+)/,
    TASK_PRIORITY: /\s!!([1-4])\s/,
    BLANK_LINE: /^\s*$/,
    TODOIST_EVENT_DATE: /(\d{4})-(\d{2})-(\d{2})/
};

export class TaskParser   {
	app:App;
    plugin: UltimateTodoistSyncForObsidian;

	constructor(app:App, plugin:UltimateTodoistSyncForObsidian) {
		//super(app,settings);
		this.app = app;
        this.plugin = plugin
	}


  
  
    //convert line text to a task object
    async convertTextToTodoistTaskObject(lineText:string,filepath:string,lineNumber?:number,fileContent?:string) {
        //console.log(`linetext is:${lineText}`)
    
        let hasParent = false
        let parentId = null
        let parentTaskObject = null
        // detect parentID
        let textWithoutIndentation = lineText
        if(this.getTabIndentation(lineText) > 0){
        //console.log(`indent is ${this.getTabIndentation(lineText)}`)
        textWithoutIndentation = this.removeTaskIndentation(lineText)
        //console.log(textWithoutIndentation)
        //console.log(`this is a subtask`)
        //read filepath
        //const fileContent = await this.plugin.fileOperation.readContentFromFilePath(filepath)
        //iterate through lines
        const lines = fileContent!.split('\n')
        //console.log(lines)
        for (let i = (lineNumber! - 1 ); i >= 0; i--) {
            //console.log(`checking indentation of line ${i}`)
            const line = lines[i]
            //console.log(line)
            //if empty line, there is no parent
            if(this.isLineBlank(line)){
                break
            }
            //if tab count is >= current line, skip
            if (this.getTabIndentation(line) >= this.getTabIndentation(lineText)) {
                    //console.log(`indent is ${this.getTabIndentation(line)}`)
                    continue       
            }
            if((this.getTabIndentation(line) < this.getTabIndentation(lineText))){
                //console.log(`indent is ${this.getTabIndentation(line)}`)
                if(this.hasTodoistId(line)){
                    parentId = this.getTodoistIdFromLineText(line)
                    hasParent = true
                    //console.log(`parent id is ${parentId}`)
                    parentTaskObject = this.plugin.cacheOperation!.loadTaskFromCacheyID(parentId)
                    break
                }
                else{
                    break
                }
            }
        }
    
    
        }
        
        const dueDate = this.getDueDateFromLineText(textWithoutIndentation)
        const labels =  this.getAllTagsFromLineText(textWithoutIndentation)
        //console.log(`labels is ${labels}`)

        //dataview format metadata
        //const projectName = this.getProjectNameFromLineText(textWithoutIndentation) ?? this.plugin.settings.defaultProjectName
        //const projectId = await this.plugin.cacheOperation.getProjectIdByNameFromCache(projectName)
        //use tag as project name

        let projectId = this.plugin.cacheOperation!.getDefaultProjectIdForFilepath(filepath as string)
        let projectName = this.plugin.cacheOperation!.getProjectNameByIdFromCache(projectId)

        if(hasParent){
            projectId = parentTaskObject.projectId
            projectName =this.plugin.cacheOperation!.getProjectNameByIdFromCache(projectId)
        }
        if(!hasParent){
                    //match tag and project
            for (const label of (labels || [])){
        
                //console.log(label)
                let labelName = label.replace(/#/g, "");
                //console.log(labelName)
                let hasProjectId = this.plugin.cacheOperation!.getProjectIdByNameFromCache(labelName)
                if(!hasProjectId){
                    continue
                }
                projectName = labelName
                //console.log(`project is ${projectName} ${label}`)
                projectId = hasProjectId
                break
            }
        }


        const content = this.getTaskContentFromLineText(textWithoutIndentation)
        const isCompleted = this.isTaskCheckboxChecked(textWithoutIndentation)
        let description = ""
        const todoist_id = this.getTodoistIdFromLineText(textWithoutIndentation)
        const priority = this.getTaskPriority(textWithoutIndentation)
        if(filepath){
            let url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
            description =`[${filepath}](${url})`;
        }
    
        const todoistTask = {
        projectId: projectId,
        content: content || '',
        parentId: parentId || null,
        dueDate: dueDate || '',
        labels: labels || [],
        description: description,
        isCompleted:isCompleted,
        todoist_id:todoist_id || null,
        hasParent:hasParent,
        priority:priority
        };
        //console.log(`converted task `)
        //console.log(todoistTask)
        return todoistTask;
    }
  
  
  
  
    hasTodoistTag(text:string){
        //console.log("checking if contains todoist tag")
        //console.log(text)
        return(REGEX.TODOIST_TAG.test(text))
    }
    
  
  
    hasTodoistId(text:string){
        const result = REGEX.TODOIST_ID.test(text)
        //console.log("checking if contains todoist id")
        //console.log(text)
        return(result)
    }
  
  
    hasDueDate(text:string){
        return(REGEX.DUE_DATE_WITH_EMOJ.test(text))
    }
  
  
    getDueDateFromLineText(text: string) {
        const result = REGEX.DUE_DATE.exec(text);
        return result ? result[1] : null;
    }

  
  
    getProjectNameFromLineText(text:string){
        const result = REGEX.PROJECT_NAME.exec(text);
        return result ? result[1] : null;
    }
  
  
    getTodoistIdFromLineText(text:string){
        //console.log(text)
        const result = REGEX.TODOIST_ID_NUM.exec(text);
        //console.log(result)
        return result ? result[1] : null;
    }
  
    getDueDateFromDataview(dataviewTask:any){
        if(!dataviewTask.due){
        return ""
        }
        else{
        const dataviewTaskDue = dataviewTask.due.toString().slice(0, 10)
        return(dataviewTaskDue)
        }

    }
  
  
  
    /*
    //convert line task to dataview task object
    async  getLineTask(filepath,line){
        //const tasks = this.app.plugins.plugins.dataview.api.pages(`"${filepath}"`).file.tasks
        const tasks = await getAPI(this.app).pages(`"${filepath}"`).file.tasks
        const tasksValues = tasks.values
        //console.log(`dataview filepath is ${filepath}`)
        //console.log(`dataview line is ${line}`)
        //console.log(tasksValues)
        const currentLineTask = tasksValues.find(obj => obj.line === line )	
        console.log(currentLineTask)
        return(currentLineTask)
    
    }
    */
  
  
  
    getTaskContentFromLineText(lineText:string) {
        const TaskContent = lineText.replace(REGEX.TASK_CONTENT.REMOVE_INLINE_METADATA,"")
                                    .replace(REGEX.TASK_CONTENT.REMOVE_TODOIST_LINK,"")
                                    .replace(REGEX.TASK_CONTENT.REMOVE_PRIORITY," ") //priority must have spaces before and after
                                    .replace(REGEX.TASK_CONTENT.REMOVE_TAGS,"")
                                    .replace(REGEX.TASK_CONTENT.REMOVE_DATE,"")
                                    .replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX,"")
                                    .replace(REGEX.TASK_CONTENT.REMOVE_CHECKBOX_WITH_INDENTATION,"")
                                    .replace(REGEX.TASK_CONTENT.REMOVE_SPACE,"")
        return(TaskContent)
    }
  
  
    //get all tags from task text
    getAllTagsFromLineText(lineText:string): string[] | null {
        const matches = lineText.match(REGEX.ALL_TAGS);

        if (matches) {
            // Remove '#' from each tag
            return matches.map(tag => tag.replace('#', ''));
        }

        return null;
    }
  
    //get checkbox status
    isTaskCheckboxChecked(lineText:string) {
        return(REGEX.TASK_CHECKBOX_CHECKED.test(lineText))
    }
  
  
    //task content compare
    taskContentCompare(lineTask:any,todoistTask:any) {
        const lineTaskContent = lineTask.content
        //console.log(dataviewTaskContent)
        
        const todoistTaskContent = todoistTask.content
        //console.log(todoistTask.content)

        //check if content was modified
        const contentModified = (lineTaskContent === todoistTaskContent)
        return(contentModified)  
    }
  
  
    //tag compare
    taskTagCompare(lineTask:any,todoistTask:any) {
    
    
        const lineTaskTags = lineTask.labels
        //console.log(dataviewTaskTags)
        
        const todoistTaskTags = todoistTask.labels
        //console.log(todoistTaskTags)
    
        //check if content was modified
        const tagsModified  = lineTaskTags.length === todoistTaskTags.length && lineTaskTags.sort().every((val: any, index: any) => val === todoistTaskTags.sort()[index]);
        return(tagsModified) 
    }
  
    //task status compare
    taskStatusCompare(lineTask:any,todoistTask:any) {
        //check if status was modified
        const statusModified = (lineTask.isCompleted === todoistTask.isCompleted)
        //console.log(lineTask)
        //console.log(todoistTask)
        return(statusModified)
    }
  
  
    //task due date compare
    async  compareTaskDueDate(lineTask: any, todoistTask: any): Promise<boolean> {
        const lineTaskDue = lineTask.dueDate
        const todoistTaskDue = todoistTask.due ?? "";
        //console.log(dataviewTaskDue)
        //console.log(todoistTaskDue)
        if (lineTaskDue === "" && todoistTaskDue === "") {
        //console.log('no due date')
        return true;
        }
    
        if ((lineTaskDue || todoistTaskDue) === "") {
        console.log(lineTaskDue);
        console.log(todoistTaskDue)
        //console.log('due date has changed')
        return false;
        }
        
        const oldDueDateUTCString = this.localDateStringToUTCDateString(lineTaskDue)
        if (oldDueDateUTCString === todoistTaskDue.date) {
        //console.log('due date is the same')
        return true;
        } else if (lineTaskDue.toString() === "Invalid Date" || todoistTaskDue.toString() === "Invalid Date") {
        console.log('invalid date')
        return false;
        } else {
        //console.log(lineTaskDue);
        //console.log(todoistTaskDue.date)
        return false;
        }
    }
    
  
    //task project id compare
    async  taskProjectCompare(lineTask:any,todoistTask:any) {
        //check if project was modified
        //console.log(dataviewTaskProjectId)
        //console.log(todoistTask.projectId)
        return(lineTask.projectId === todoistTask.projectId)
    }
  
  
    //check if task is indented
    isIndentedTask(text:string) {
        return(REGEX.TASK_INDENTATION.test(text));
    }
  
  
    //count number of tabs
    //console.log(getTabIndentation("\t\t- [x] This is a task with two tabs")); // 2
    //console.log(getTabIndentation("  - [x] This is a task without tabs")); // 0
    getTabIndentation(lineText:string){
        const match = REGEX.TAB_INDENTATION.exec(lineText)
        return match ? match[1].length : 0;
    }


    //	Task priority from 1 (normal) to 4 (urgent).
    getTaskPriority(lineText:string): number{
        const match = REGEX.TASK_PRIORITY.exec(lineText)
        return match ? Number(match[1]) : 1;
    }
  
  
  
    //remove task indentation
    removeTaskIndentation(text: string) {
        const regex = /^([ \t]*)?- \[(x| )\] /;
        return text.replace(regex, "- [$2] ");
    }
  
  
    //check if line is empty
    isLineBlank(lineText:string) {
        return(REGEX.BLANK_LINE.test(lineText))
    }
  
  
  //insert date in linetext
    insertDueDateBeforeTodoist(text: string, dueDate: string) {
        const regex = new RegExp(`(${keywords.TODOIST_TAG})`)
        return text.replace(regex, `📅 ${dueDate} $1`);
  }

    //extra date from obsidian event
    // usage example
    //const str = "2023-03-27T15:59:59.000000Z";
    //const dateStr = ISOStringToLocalDateString(str);
    //console.log(dateStr); // outputs 2023-03-27
    ISOStringToLocalDateString(utcTimeString:string) {
        try {
          if(utcTimeString === null){
            return null
          }
          let utcDateString = utcTimeString;
          let dateObj = new Date(utcDateString); // convert UTC string to Date object
          let year = dateObj.getFullYear();
          let month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
          let date = dateObj.getDate().toString().padStart(2, '0');
          let localDateString = `${year}-${month}-${date}`;
          return localDateString;
          return(localDateString);
        } catch (error) {
          console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
          return null;
        }
    }


    //extra date from obsidian event
    // usage example
    //const str = "2023-03-27T15:59:59.000000Z";
    //const dateStr = ISOStringToLocalDatetimeString(str);
    //console.log(dateStr); // outputs Mon Mar 27 2023 23:59:59 GMT+0800 (China Standard Time)
    ISOStringToLocalDatetimeString(utcTimeString:string) {
        try {
          if(utcTimeString === null){
            return null
          }
          let utcDateString = utcTimeString;
          let dateObj = new Date(utcDateString); // convert UTC string to Date object
          let result = dateObj.toString();
          return(result);
        } catch (error) {
          console.error(`Error extracting date from string '${utcTimeString}': ${error}`);
          return null;
        }
    }



    //convert date from obsidian event
    // usage example
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDatetimeString(str);
    //console.log(dateStr); // outputs 2023-03-27T00:00:00.000Z
    localDateStringToUTCDatetimeString(localDateString:string) {
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
    
    //convert date from obsidian event
    // usage example
    //const str = "2023-03-27";
    //const utcStr = localDateStringToUTCDateString(str);
    //console.log(dateStr); // outputs 2023-03-27
    localDateStringToUTCDateString(localDateString:string) {
        try {
          if(localDateString === null){
            return null
          }
          localDateString = localDateString + "T08:00";
          let localDateObj = new Date(localDateString);
          let ISOString = localDateObj.toISOString()
          let utcDateString = ISOString.slice(0,10)
          return(utcDateString);
        } catch (error) {
          console.error(`Error extracting date from string '${localDateString}': ${error}`);
          return null;
        }
    }
    
    isMarkdownTask(str: string): boolean {
        const taskRegex = /^\s*-\s+\[([x ])\]/;
        return taskRegex.test(str);
    }

    addTodoistTag(str: string): string {
        return(str +` ${keywords.TODOIST_TAG}`);
    }

    getObsidianUrlFromFilepath(filepath:string){
        const url = encodeURI(`obsidian://open?vault=${this.app.vault.getName()}&file=${filepath}`)
        const obsidianUrl =`[${filepath}](${url})`;
        return(obsidianUrl)
    }


    addTodoistLink(linetext: string,todoistLink:string): string {
        const regex = new RegExp(`${keywords.TODOIST_TAG}`, "g");
        return linetext.replace(regex, todoistLink + ' ' + '$&');
    }


    //check if contains todoist link
    hasTodoistLink(lineText:string){
        return(REGEX.TODOIST_LINK.test(lineText))
    }
}
