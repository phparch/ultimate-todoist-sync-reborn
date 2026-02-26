import { App, requestUrl } from 'obsidian';
import { TodoistApi } from "@doist/todoist-api-typescript";
import UltimateTodoistSyncForObsidian from "../main";
import { obsidianFetch } from "./obsidianFetchAdapter";


type Event = {
  id: string;
  objectType: string;
  objectId: string;
  eventType: string;
  eventDate: string;
  parentProjectId: string;
  parentItemId: string | null;
  initiatorId: string | null;
  extraData: Record<string, any>;
};

type FilterOptions = {
  eventType?: string;
  objectType?: string;
};

export class TodoistSyncAPI   {
	app:App;
  plugin: UltimateTodoistSyncForObsidian;

	constructor(app:App, plugin:UltimateTodoistSyncForObsidian) {
		//super(app,settings);
		this.app = app;
    this.plugin = plugin;
	}

    initializeAPI(){
        const token = this.plugin.settings.todoistAPIToken
        const api = new TodoistApi(token, { customFetch: obsidianFetch } as any)
        return api
    }

    //backup todoist
    async getAllResources() {
    const accessToken = this.plugin.settings.todoistAPIToken
    const url = 'https://api.todoist.com/api/v1/sync';

    try {
      const response = await requestUrl({
        url,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          sync_token: "*",
          resource_types: '["all"]'
        }).toString(),
        throw: false,
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Failed to fetch all resources: ${response.status}`);
      }

      return response.json;
    } catch (error) {
      console.error(error);
      throw new Error('Failed to fetch all resources due to network error');
    }
    }

    //backup todoist
    async getUserResource() {
      const accessToken = this.plugin.settings.todoistAPIToken
      const url = 'https://api.todoist.com/api/v1/sync';

      try {
        const response = await requestUrl({
          url,
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            sync_token: "*",
            resource_types: '["user_plan_limits"]'
          }).toString(),
          throw: false,
        });

        if (response.status < 200 || response.status >= 300) {
          throw new Error(`Failed to fetch all resources: ${response.status}`);
        }

        const data = response.json;
        console.log(data)
        return data;
      } catch (error) {
        console.error(error);
        throw new Error('Failed to fetch user resources due to network error');
      }
      }



      //update user timezone
      async updateUserTimezone() {
        const unixTimestampString: string = Math.floor(Date.now() / 1000).toString();
        const accessToken = this.plugin.settings.todoistAPIToken
        const url = 'https://api.todoist.com/api/v1/sync';
        const commands = [
          {
            'type': "user_update",
            'uuid': unixTimestampString,
            'args': { 'timezone': 'Asia/Shanghai' },
          },
        ];

        try {
          const response = await requestUrl({
            url,
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ commands: JSON.stringify(commands) }).toString(),
            throw: false,
          });

          if (response.status < 200 || response.status >= 300) {
            throw new Error(`Failed to update user timezone: ${response.status}`);
          }

          const data = response.json;
          console.log(data)
          return data;
        } catch (error) {
          console.error(error);
          throw new Error('Failed to fetch user resources due to network error');
        }
        }

    //get activity logs using the SDK (v1 API uses GET, not POST)
    async getAllActivityEvents() {
      const api = this.initializeAPI()
      try {
        const response = await api.getActivityLogs({})
        return response.results || []
      } catch (error) {
        throw error;
      }
    }

    async getNonObsidianAllActivityEvents() {
      try{
        const allActivityEvents = await this.getAllActivityEvents()
        //exclude activity from Obsidian client
        const filteredArray = allActivityEvents.filter((obj: any) => !obj.extraData?.client?.includes("obsidian"));
        return(filteredArray)

      }catch(err){
        console.error('An error occurred:', err);
      }

    }


    filterActivityEvents(events: any[], options: FilterOptions): any[] {
      return events.filter(event =>
        (options.eventType ? event.eventType === options.eventType : true) &&
        (options.objectType ? event.objectType === options.objectType : true)

        );
    };

    //get completed items activity
    async getCompletedItemsActivity() {
        const api = this.initializeAPI()
        try {
            const response = await api.getActivityLogs({ objectType: 'task', eventType: 'completed' })
            return response.results || []
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch completed items due to network error');
        }
    }



    //get uncompleted items activity
    async getUncompletedItemsActivity() {
        const api = this.initializeAPI()
        try {
            const response = await api.getActivityLogs({ objectType: 'task', eventType: 'uncompleted' })
            return response.results || []
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch uncompleted items due to network error');
        }
    }


    //get non-obsidian completed event
    async getNonObsidianCompletedItemsActivity() {
        const completedItemsActivityEvents = await this.getCompletedItemsActivity()
        //exclude activity from Obsidian client
        const filteredArray = completedItemsActivityEvents.filter((obj: any) => !obj.extraData?.client?.includes("obsidian"));
        return(filteredArray)
    }


    //get non-obsidian uncompleted event
    async  getNonObsidianUncompletedItemsActivity() {
        const uncompletedItemsActivityEvents = await this.getUncompletedItemsActivity()
        //exclude activity from Obsidian client
        const filteredArray = uncompletedItemsActivityEvents.filter((obj: any) => !obj.extraData?.client?.includes("obsidian"));
        return(filteredArray)
    }


    //get updated items activity
    async  getUpdatedItemsActivity() {
        const api = this.initializeAPI()
        try {
            const response = await api.getActivityLogs({ objectType: 'task', eventType: 'updated' })
            return response.results || []
        } catch (error) {
            console.error(error);
            throw new Error('Failed to fetch updated items due to network error');
        }
    }


    //get non-obsidian updated event
    async  getNonObsidianUpdatedItemsActivity() {
        const updatedItemsActivityEvents = await this.getUpdatedItemsActivity()
        //exclude activity from Obsidian client
        const filteredArray = updatedItemsActivityEvents.filter((obj: any) => {
          const client = obj.extraData && obj.extraData.client;
          return !client || !client.includes("obsidian");
        });
        return(filteredArray)
    }


    //get projects activity
    async getProjectsActivity() {
      const api = this.initializeAPI()
      try {
          const response = await api.getActivityLogs({ objectType: 'project' })
          return response.results || []
      } catch (error) {
          console.error(error);
          throw new Error('Failed to fetch projects activities due to network error');
      }
  }

}
