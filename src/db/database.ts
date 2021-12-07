import fs from 'fs'
import { DB, UI, IntraLogin, DateString } from '../types'

function formatDate(date: Date, hoursMinutes: boolean = true): DateString {
	const dateFormat: Intl.DateTimeFormatOptions = {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		timeZone: 'CET',
		hour12: false
	}
	if (hoursMinutes) {
		dateFormat.hour = 'numeric'
		dateFormat.minute = 'numeric'
	}
	return date.toLocaleString('nl-NL', dateFormat).replace(/\.$/, '')
}

function getWeekAndYear(date: Date): { year: number, week: number } {
	let d = new Date(date)
	d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)) // make sunday's day number 7
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
	// @ts-ignore
	const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
	return { year: d.getUTCFullYear(), week: weekNo };
}

// weeknumber starts from 1
function getWeekRange(year: number, week: number): { start: DateString, end: DateString } {
	const d = new Date("Jan 01, " + year + " 01:00:00")
	const firstDay = new Date(year, 0, 1).getDay();
	const w = d.getTime() - (3600000 * 24 * (firstDay - 1)) + 604800000 * (week - 1)
	const start = new Date(w)
	const end = new Date(w + 518400000)
	return {
		start: formatDate(start, false),
		end: formatDate(end, false),
	}
}

function reportsToWeekdata(reports: DB.LogtimeReport[]): UI.Weekdata[] {
	let weekDatas: UI.Weekdata[] = []
	for (const report of reports) {
		const { year, week } = getWeekAndYear(new Date(report.d))
		const weekData = weekDatas.find(x => x.year === year && x.week === week)
		if (!weekData)
			weekDatas.push({
				year,
				week,
				...getWeekRange(year, week),
				buildingTime: report.buildingTime,
				clusterTime: report.clusterTime,
			})
		else {
			weekData.buildingTime += report.buildingTime
			weekData.clusterTime += report.clusterTime
		}
	}
	weekDatas = weekDatas.sort((a, b) => b.week - a.week) // last week first
	return weekDatas
}

function toUIlogtimeReport(report: DB.LogtimeReport): UI.LogtimeReport {
	return {
		date: formatDate(new Date(report.d), false),
		buildingTime: report.buildingTime,
		clusterTime: report.clusterTime,
	}
}

export class DataBase {
	readonly filePath: fs.PathLike
	#content: DB.Content

	constructor(fileName: string) {
		this.filePath = fileName
		if (!fs.existsSync(this.filePath)) {
			const emptyDB: DB.Content = { reports: [], forwardVerifications: [] }
			fs.writeFileSync(this.filePath, JSON.stringify(emptyDB))
		}
		this.#content = JSON.parse(fs.readFileSync(this.filePath).toString())!
	}

	async #syncToDisk() {
		await fs.promises.writeFile(this.filePath, JSON.stringify(this.#content))
	}


	async addLogtimeReport(report: DB.LogtimeReport): Promise<void> {
		if (this.#content.reports.find(x => x.mailID == report.mailID))
			return
		this.#content.reports.push(report)
		await this.#syncToDisk()
	}

	getPersonInfo(login: IntraLogin): UI.User | null {
		const reports: DB.LogtimeReport[] = this.#content.reports.filter(x => x.login == login)
		const weekDatas = reportsToWeekdata(reports)

		let lastUpdate = new Date(0)
		for (const report of reports) {
			const d = new Date(report.d)
			if (d > lastUpdate)
				lastUpdate = d
		}
		return {
			lastUpdate: {
				formatted: formatDate(lastUpdate, true),
				timestamp: lastUpdate
			},
			weeks: weekDatas,
			reports: reports.map(report => toUIlogtimeReport(report))
		}
	}
}
