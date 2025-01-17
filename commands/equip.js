const {SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, PermissionsBitField} = require("discord.js")
const util = require("util")

module.exports = {
    data: new SlashCommandBuilder()
        .setName("equip")
        .setDescription("Equip a role from your inventory"),
    async execute(interaction, Database) {
		if (!interaction.inGuild()) {
			interaction.reply({content: "Please run this in a guild!", ephemeral: true})
			return null
		}
		if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
			interaction.reply({content: "This bot has no permissions to manage roles.... what are the admins doing??", ephemeral: true})
			return null
		}
		let guildData = await Database.models.Guild.findOne({where: {guildId: interaction.guildId}})
		if (!guildData) {
			interaction.reply({content: "This server is empty... what are these admins doing?", ephemeral: true})
			return null
		}
		let userData = (await guildData.getUsers({where: {userId: interaction.member.id}}))[0]
		if (!userData) {
			interaction.reply({content: "You are broke! go gamble", ephemeral: true})
			return null
		}
		let inventory = await userData.getRoles()
		if (inventory.length == 0) {
			interaction.reply({content: "You are broke!", ephemeral: true})
			return null
		}
		var unequip = new StringSelectMenuOptionBuilder()
			.setLabel("Nothing")
			.setDescription("Unequip whatever role you currently have.")
			.setValue("unequip")
		let roleMenus = []
		let options = [unequip]
		for (var role of inventory) {
			var discordRole = await interaction.guild.roles.fetch(role.roleId, 1)

			var option = new StringSelectMenuOptionBuilder()
			if (role) {
				option.setLabel(discordRole.name)
				option.setValue(`${role.roleId}`)
			} else {
				option.setLabel(`${role.roleId}`)
				option.setDescription("This role doesn't exist. Somehow, you have it.")
				option.setValue(`${role.roleId}`)
			}
			options.push(option)
		}
		//Because of discord's 25 per menu limit, we need to break this into chunks.
		let amountMenus = Math.ceil(options.length/25)
		for (let i=0; i < amountMenus; i++) {
			let roleMenu = new StringSelectMenuBuilder()
				.setCustomId(`roleMenu${i}`)
				.setMinValues(0)
				.setMaxValues(1)
				.setPlaceholder(`(${i+1}/${amountMenus}) Pick a role to equip...`)
			let localOptions = []
			for (let choiceIndex = i*25; choiceIndex < i*25 + 25 && choiceIndex < options.length; choiceIndex++) {
				localOptions.push(options[choiceIndex])
			}
			roleMenu.setOptions(localOptions)
			roleMenus.push(roleMenu)
		}

		let previousButton = new ButtonBuilder()
			.setCustomId("previous")
			.setLabel("<")
			.setDisabled(true)
			.setStyle(ButtonStyle.Secondary)
		let nextButton = new ButtonBuilder()
			.setCustomId("next")
			.setLabel(">")
			.setStyle(ButtonStyle.Secondary)
		
		let currentMenu = 0
		let row = new ActionRowBuilder()
			.addComponents(roleMenus[currentMenu])
		let buttonRow = new ActionRowBuilder()
			.addComponents(previousButton, nextButton)
		let components = [row]
		if (roleMenus.length > 1) {components.push(buttonRow)}
		let response = await interaction.reply({
			content: 'Pick a role',
			components: components,
			ephemeral: true
		})

		let filter = (inter) => inter.member.id == interaction.member.id;
		let collector = response.createMessageComponentCollector({ filter, componentType: ComponentType.StringSelect, time: 60000*5 }) // valid for 5 minutes
		let buttonCollector = response.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 60000*5 }) // valid for 5 minutes
		buttonCollector.on("collect", async i => {
			if (i.customId == "previous") {
				currentMenu = Math.max(currentMenu - 1, 0)
				row = new ActionRowBuilder()
					.addComponents(roleMenus[currentMenu])
				previousButton.setDisabled(currentMenu == 0)
				nextButton.setDisabled(currentMenu == roleMenus.length - 1)
				buttonRow = new ActionRowBuilder()
					.addComponents([previousButton, nextButton])
				i.update({components: [row, buttonRow]})
			} else if (i.customId == "next") {
				currentMenu = Math.min(currentMenu + 1, roleMenus.length - 1)
				row = new ActionRowBuilder()
					.addComponents(roleMenus[currentMenu])
				previousButton.setDisabled(currentMenu == 0)
				nextButton.setDisabled(currentMenu == roleMenus.length - 1)
				buttonRow = new ActionRowBuilder()
					.addComponents([previousButton, nextButton])
				i.update({components: [row, buttonRow]})
			}
		})
		let endingMessage = "No changes were made."
		collector.on('collect', async i => {
			await guildData.reload()
			await userData.reload()
			let userRoles = (await userData.getRoles()).map(function(role) {return role.roleId})
			let guildRoles = []
			for (var rank of await guildData.getRanks()) {
				for (var role of await rank.getRoles()) {
					guildRoles.push(role.roleId)
				}
			}
			if (!interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
				endingMessage = "This bot has no permissions to manage roles.... what are the admins doing??"
				collector.stop("error")
				return null
			}
			if (i.values[0] == "unequip") {
				endingMessage = "Unequipped your role!"
				await interaction.member.roles.remove(guildRoles, "User requested unequip")
			} else {
				var role = await interaction.guild.roles.fetch(i.values[0], 1)

				if (role) {
					let canEquip = interaction.guild.members.me.roles.highest.comparePositionTo(role) > 0
					if (canEquip) {
						if (!userRoles.includes(i.values[0])) {
							endingMessage = `You no longer have <@&${i.values[0]}>. Did you think I would just let you equip it?`
						} else {
							await interaction.member.roles.remove(guildRoles, "Automatic unequip")
							await interaction.member.roles.add(role, "User requested equip")
							endingMessage = `Successfully equipped <@&${i.values[0]}>.`
						}
					} else {
						endingMessage = `<@&${i.values[0]}> is too high in the role hierarchy. Yell at admins to move it below this bot's highest role.`
					}
				} else {
					endingMessage = `Whatever role you picked no longer exists. Go complain to admins`
				}
			}
			collector.stop("picked")
		})
		collector.on("end", async (collected, reason) => {
			buttonCollector.stop()
			interaction.editReply({components: [], content: endingMessage})
		})
    }
}