import { Sequelize, DataTypes } from "sequelize";

//, {logging: false}
const Discord = require("discord.js")
const path = require("bun:path")
const fs = require("fs")
const commandsPath = path.join(__dirname, 'commands')
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'))
const Database = new Sequelize("sqlite:Data.sqlite", {logging: false});
const Guild = Database.define("Guild", {
	guildId: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: ""
	},
	gambleCap: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 10
	},
	gambleDebounce: {
		type: DataTypes.NUMBER,
		allowNull: false,
		defaultValue: 86400000
	}
})
const Rank = Database.define("Rank", {
	name: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: ""
	},
	probability: {
		type: DataTypes.NUMBER,
		allowNull: false,
		defaultValue: 0
	},
	sacrifice: {
		type: DataTypes.BOOLEAN,
		allowNull: false,
		defaultValue: false
	}
})
const User = Database.define("User", {
	userId: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: ""
	},
	amountGambled: {
		type: DataTypes.INTEGER,
		allowNull: false,
		defaultValue: 0
	},
	lastGamble: {
		type: DataTypes.NUMBER,
		allowNull: false,
		defaultValue: 0
	}
});

const Role = Database.define("Role", {
	roleId: {
		type: DataTypes.STRING,
		allowNull: false,
		defaultValue: "",
		unique: true
	}
})

Guild.hasMany(User, {
	onDelete: "CASCADE"
})
User.belongsTo(Guild)
Guild.hasMany(Rank, {
	onDelete: "CASCADE"
})
Guild.hasMany(Role, {
	onDelete: "CASCADE"
})
Rank.belongsTo(Guild)
Rank.hasMany(Role, {
	onDelete: "CASCADE"
})
User.hasMany(Role)
Role.belongsTo(Rank)
Role.belongsToMany(User, {through: "UserRoles"})
Role.belongsTo(Guild)
//These models are also located at Database.models.name, where name is the name of the model.
await Database.sync();

const client = new Discord.Client({ intents: [
	Discord.GatewayIntentBits.Guilds,
	Discord.GatewayIntentBits.GuildMessages,
	Discord.GatewayIntentBits.DirectMessages,
	Discord.GatewayIntentBits.DirectMessageReactions,
	Discord.GatewayIntentBits.GuildMessageReactions
]})

client.commands = new Discord.Collection()

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file)
	const command = require(filePath)
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ("data" in command && "execute" in command) {
		client.commands.set(command.data.name, command)
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`)
	}
}

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`)
})

client.on("interactionCreate", async interaction => {
	if (interaction.isChatInputCommand()) {
		const command = client.commands.get(interaction.commandName)
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`)
			return null
		}
		try {
			await command.execute(interaction, Database)
		} catch (error) {
			console.log(error)
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true })
			} else {
				await interaction.reply({ content: "There was an error while executing this command!", ephemeral: true })
			}
		}
	}
})
client.on("roleDelete", async role => {
	Role.destroy({where: {roleId: role.id}})
})
client.login(process.env.TOKEN)
