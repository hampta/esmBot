import serversConfig from "../../config/servers.json" with { type: "json" };
import { random } from "../../utils/misc.js";
import paginator from "../../utils/pagination/pagination.js";
import Command from "../../classes/command.js";

class YouTubeCommand extends Command {
  async run() {
    const query = this.options.query ?? this.args.join(" ");
    this.success = false;
    if (!query || !query.trim()) return "You need to provide something to search for!";
    await this.acknowledge();
    const messages = [];
    const videos = await fetch(`${random(serversConfig.searx)}/search?format=json&safesearch=1&categories=videos&q=!youtube%20${encodeURIComponent(query)}`).then(res => res.json());
    if (videos.results.length === 0) return "I couldn't find any results!";
    for (const [i, value] of videos.results.entries()) {
      messages.push({ content: `Page ${i + 1} of ${videos.results.length}\n<:youtube:637020823005167626> **${value.title.replaceAll("*", "\\*")}**\nUploaded by **${value.author.replaceAll("*", "\\*")}**\n${value.url}` });
    }
    this.success = true;
    return paginator(this.client, { type: this.type, message: this.message, interaction: this.interaction, author: this.author }, messages);
  }

  static flags = [{
    name: "query",
    type: 3,
    description: "The query you want to search for",
    classic: true,
    required: true
  }];

  static description = "Searches YouTube";
  static aliases = ["yt", "video", "ytsearch"];
}

export default YouTubeCommand;