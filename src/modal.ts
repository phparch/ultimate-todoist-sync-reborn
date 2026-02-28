import { App, Modal, Setting } from "obsidian";
import UltimateTodoistSyncForObsidian from "../main";
import { TodoistProject } from "./settings";

export class SetDefalutProjectInTheFilepathModal extends Modal {
  defaultProjectId: string
  defaultProjectName: string
  filepath: string
  plugin: UltimateTodoistSyncForObsidian


  constructor(app: App, plugin: UltimateTodoistSyncForObsidian, filepath: string) {
    super(app);
    this.filepath = filepath
    this.plugin = plugin
    this.open()
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h5', { text: 'Set default project for Todoist tasks in the current file' });

    this.defaultProjectId = this.plugin.cacheOperation!.getDefaultProjectIdForFilepath(this.filepath)
    this.defaultProjectName = this.plugin.cacheOperation!.getProjectNameByIdFromCache(this.defaultProjectId)
    console.debug(this.defaultProjectId)
    console.debug(this.defaultProjectName)
    const myProjectsOptions: Record<string, string> = this.plugin.settings.todoistTasksData?.projects?.reduce((obj: Record<string, string>, item: TodoistProject) => {
        obj[(item.id).toString()] = item.name;
        return obj;
        }, {} as Record<string, string>
    );


    new Setting(contentEl)
    .setName('Default project')
    //.setDesc('Set default project for todoist tasks in the current file')
    .addDropdown(component =>
        component
                .addOption(this.defaultProjectId, this.defaultProjectName)
                .addOptions(myProjectsOptions)
                .onChange((value) => {
                    console.debug(`project id  is ${value}`)
                    //this.plugin.settings.defaultProjectId = this.result
                    //this.plugin.settings.defaultProjectName = this.plugin.cacheOperation!.getProjectNameByIdFromCache(this.result)
                    //this.plugin.saveSettings()
                    this.plugin.cacheOperation!.setDefaultProjectIdForFilepath(this.filepath, value)
                    void this.plugin.setStatusBarText()
                    this.close();

                })

        )



  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
