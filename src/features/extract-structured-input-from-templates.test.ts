import { afterEach, describe, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { loadPluginConfig } from "../plugin-config"
import {
  createFakeCoordinatorClient,
  createWorkerRuntimeContext,
} from "../test-helpers/fake-coordinator-client"
import { runDraftTopologyModel } from "./draft-topology-model"
import { runExtractStructuredInputFromTemplates } from "./extract-structured-input-from-templates"

const createdDirectories: string[] = []

function createTempWorkspace(): string {
  const directory = mkdtempSync(join(tmpdir(), "cloud-solution-template-struct-"))
  const fixturesDirectory = join(directory, "fixtures")
  mkdirSync(fixturesDirectory, { recursive: true })
  writeFileSync(join(fixturesDirectory, "cabling-template.xlsx"), "cabling workbook")
  writeFileSync(join(fixturesDirectory, "rack-layout-template.xlsx"), "rack workbook")
  writeFileSync(join(fixturesDirectory, "port-plan.xlsx"), "port workbook")
  writeFileSync(join(fixturesDirectory, "inventory.xlsx"), "inventory workbook")
  writeFileSync(join(fixturesDirectory, "server-parameters.xlsx"), "server parameter workbook")
  writeFileSync(join(fixturesDirectory, "switch-parameters.xlsx"), "switch parameter workbook")
  createdDirectories.push(directory)
  return directory
}

function loadLocalConvertedMarkdownManifest(rootDirectory: string) {
  const manifestPath = join(rootDirectory, "test", "converted-markdown", "convertedDocuments.json")
  if (!existsSync(manifestPath)) {
    return undefined
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    convertedDocuments: Array<{
      kind: "document" | "diagram" | "image"
      ref: string
      note?: string
      markdownRef: string
    }>
  }

  return manifest.convertedDocuments
}

afterEach(() => {
  for (const directory of createdDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("runExtractStructuredInputFromTemplates", () => {
  test("builds draft-ready structuredInput from real-template workbook markdown", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      {
        kind: "document" as const,
        ref: "fixtures/cabling-template.xlsx",
        note: "Cable planning template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/rack-layout-template.xlsx",
        note: "Rack layout template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/port-plan.xlsx",
        note: "Port plan workbook",
      },
    ]
    const { client, createCalls, promptCalls } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | F01 | 业务POD-C1服务器-1 | F01 | 业务POD-千兆带内管理TOR-1 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 10 | 10 | F01 | 业务POD-C1服务器-1 | F02 | 业务POD-千兆带外管理TOR-1 |",
                  "",
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 3 | 40GE双头光跳纤 | LR4 | 2 | 20 | 40 | F01 | 业务POD-千兆带内管理TOR-1 | C01 | 管理POD-管理核心交换机-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | F列01柜 | 机柜(F01） | Unnamed: 3 | 7kw | Unnamed: 5 | Unnamed: 6 | F列02柜 | 机柜(F02） | Unnamed: 9 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 350 | 业务POD-千兆带内管理TOR-1 | 42 | NaN | NaN | NaN | 350 | 业务POD-千兆带外管理TOR-1 | 42 | NaN |",
                  "| NaN | 900 | 业务POD-C1服务器-1 | 10 | NaN | NaN | NaN | NaN | NaN | 10 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## C1服务器",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 3 | 双口10GE光口网卡 | 0 | 10G | 管理接入 | H3C S6805-54HF | 万兆管理网络 | NaN |",
                  "| NaN | NaN | 1 | 10G | 管理接入 | H3C S6805-54HF | 万兆管理网络 | NaN |",
                  "| 4 | 板载HDM口 | 1 | 1G | IPMI接入 | H3C S5560X-54C-EI | IPMI网络 | NaN |",
                  "",
                  "## 千兆带内管理TOR",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1 | 48个GE接口 | 1-48 | 1G | 服务器 | 服务器 | 千兆管理网络 | NaN |",
                  "| 2 | 4个10GE上联口 | 49-52 | 10G | 管理核心交换机 | S12508G-AF | 内部互联 | NaN |",
                  "",
                  "## 千兆带外管理TOR",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1 | 48个GE接口 | 1-48 | 1G | 服务器 | 服务器 | IPMI网络 | NaN |",
                  "",
                  "## 管理核心交换机",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 2 | 36端口40GE板卡 | 1-4 | 40GE | 千兆带内管理TOR | S5560X-54C-EI | 内部互联 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-struct-1",
          projectName: "Template Structured Input Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(createCalls).toHaveLength(1)
    expect(promptCalls).toHaveLength(1)
    expect(result.nextAction).toBe("draft_topology_model")
    expect(result.summary).toEqual({
      parsedSourceCount: 3,
      rackCount: 3,
      deviceCount: 4,
      linkCount: 3,
    })
    expect(result.draftInput.structuredInput.racks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "F01", maxPowerKw: 7 }),
        expect.objectContaining({ name: "F02", maxPowerKw: 7 }),
        expect.objectContaining({ name: "C01" }),
      ]),
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "业务POD-C1服务器-1",
          role: "server",
          rackName: "F01",
          rackPosition: expect.any(Number),
          rackUnitHeight: 2,
          powerWatts: 900,
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "3/0", portType: "inband-mgmt", portIndex: 0 }),
            expect.objectContaining({ name: "4/1", portType: "oob-mgmt", portIndex: 1 }),
          ]),
        }),
        expect.objectContaining({
          name: "业务POD-千兆带内管理TOR-1",
          role: "switch",
          rackName: "F01",
          rackPosition: expect.any(Number),
          rackUnitHeight: 1,
        }),
      ]),
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          linkType: "inband-mgmt",
          cableId: "1",
          endpointA: { deviceName: "业务POD-C1服务器-1", portName: "3/0" },
          endpointB: { deviceName: "业务POD-千兆带内管理TOR-1", portName: "1/1" },
        }),
        expect.objectContaining({
          linkType: "uplink",
          cableId: "3",
          endpointA: { deviceName: "业务POD-千兆带内管理TOR-1", portName: "2/49" },
          endpointB: { deviceName: "管理POD-管理核心交换机-1", portName: "2/1" },
        }),
      ]),
    )
    expect(result.warnings).not.toContain(
      "Recognized workbook fixtures/port-plan.xlsx as a port-plan source, but this slice does not yet derive exact endpoint numbering from it.",
    )
  })

  test("imports device power from inventory plus parameter workbooks and defaults racks to 48U/7kW", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
      { kind: "document" as const, ref: "fixtures/inventory.xlsx", note: "Inventory workbook" },
      { kind: "document" as const, ref: "fixtures/server-parameters.xlsx", note: "Server 参数应答表" },
      { kind: "document" as const, ref: "fixtures/switch-parameters.xlsx", note: "Switch 参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                  "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 编号 | 项目 | 产品型号/编号 | 产品描述（中文） | 单位 | 数量（a） | 备注 | 调整后数量 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1.1.10 | B1H服务器 | NF5280-M7-A0-R0-00 | server | 台 | 1 | NaN | 1 |",
                  "| 1.1.23 | 千兆带内/带外管理TOR | H3C S5560X-54C-EI | switch | 台 | 1 | NaN | 1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[3],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| B1H服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[4],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 千兆带内/带外管理TOR | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-power-1",
          projectName: "Template Power Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.racks).toEqual([
      expect.objectContaining({ name: "E15", uHeight: 48, maxPowerKw: 7 }),
    ])
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
        expect.objectContaining({ name: "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11", powerWatts: 55 }),
      ]),
    )
    expect(result.warnings).toContain(
      "Defaulted rack E15 to 48U because no explicit rack height was provided for this project.",
    )
    expect(result.warnings).toContain(
      "Defaulted rack E15 to 7kW because no explicit rack power limit was provided; project confirmation is still required.",
    )
  })

  test("parses switch port-plan tables with a leading placeholder column", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器业务存储连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 10GE双头光跳纤 | 多模光纤双芯 LC-LC | 2 | 15 | 30 | E15 | 业务POD-B1H服务器-CS5280H3-1 | D13 | 业务POD-SDN硬件接入交换机(10GE)-H3C S6805-54HF-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 业务接入交换机",
                  "",
                  "| Unnamed: 0 | 业务POD SDN硬件接入交换机(10GE)奇数号  H3C S6805-54HF | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个10GE SFP+接口 | 1-24 | 10GE(850nm,300m,LC) | 服务器 | 服务器 | 服务器、存储业务前端接入，每对接入20台服务器，柜顶部署 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-switch-port-plan-1",
          projectName: "Template Switch Port Plan Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "No workbook-derived port plan profile matched device 业务POD-SDN硬件接入交换机(10GE)-H3C S6805-54HF-1. Falling back to synthesized port naming for data.",
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "业务POD-SDN硬件接入交换机(10GE)-H3C S6805-54HF-1",
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "1/1" }),
          ]),
        }),
      ]),
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointB: {
            deviceName: "业务POD-SDN硬件接入交换机(10GE)-H3C S6805-54HF-1",
            portName: "1/1",
          },
        }),
      ]),
    )
  })

  test("prefers exact switch model matches over relaxed family fallback in port-plan selection", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机互联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 25GE双头光跳纤 | 多模光纤双芯 LC-LC | 2 | 10 | 20 | D07 | 业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-1 | D06 | 业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 业务接入交换机",
                  "",
                  "| Unnamed: 0 | 业务POD SDN硬件接入交换机(10GE)奇数号  H3C S6805-54HF | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个10GE SFP+接口 | 47 | 10GE(850nm,300m,LC) | SDN硬件接入交换机(10GE)2 | S6805-54HF | keepalive |",
                  "| NaN | 业务POD SDN硬件接入交换机(10GE)偶数号  H3C S6805-54HF | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个10GE SFP+接口 | 47 | 10GE(850nm,300m,LC) | SDN硬件接入交换机(10GE)1 | S6805-54HF | keepalive |",
                  "| NaN | 业务POD SDN硬件接入交换机(25GE)奇数号  H3C S6850-56HF | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个25GE SFP28接口 | 24 | 25GE(850nm,100m,SR,MM,LC) | SDN硬件接入交换机(25GE)2 | S6850-56HF-H3 | keepalive |",
                  "| NaN | 业务POD SDN硬件接入交换机(25GE)偶数号  H3C S6850-56HF | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个25GE SFP28接口 | 24 | 25GE(850nm,100m,SR,MM,LC) | SDN硬件接入交换机(25GE)1 | S6850-56HF-H3 | keepalive |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-switch-model-precedence-1",
          projectName: "Template Switch Model Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple workbook-derived port plan profiles matched device 业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-1; selected '业务POD SDN硬件接入交换机(10GE)奇数号 H3C S6805-54HF' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointA: {
            deviceName: "业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-1",
            portName: "1/24",
          },
          endpointB: {
            deviceName: "业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-2",
            portName: "1/24",
          },
          linkType: "peer-link",
        }),
      ]),
    )
  })

  test("prefers exact role matches for same-model aggregation switches", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 100GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 15 | 15 | J11 | 核心区-管理域防火墙-H3c SecPath M9000-CN04-1 | J05 | 互联层-南北向汇聚交换机-H3C S12516G-AF-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 汇聚交换机",
                  "",
                  "| Unnamed: 0 | 东西向汇聚交换机1 S12516G-AF | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 2 | 36端口100G以太网光接口模块(QSFP28)(TE) | 9 | 100GE LR4 | 核心交换机1 | S12516G-AF | 内部互联 |",
                  "| NaN | 南北向汇聚交换机1 S12516G-AF | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 2 | 36端口100G以太网光接口模块(QSFP28)(TE) | 11 | 100GE LR4 | 核心交换机1 | S12516G-AF | 内部互联 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-switch-role-precedence-1",
          projectName: "Template Switch Role Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple workbook-derived port plan profiles matched device 互联层-南北向汇聚交换机-H3C S12516G-AF-1; selected '东西向汇聚交换机1 S12516G-AF' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointB: {
            deviceName: "互联层-南北向汇聚交换机-H3C S12516G-AF-1",
            portName: "2/11",
          },
        }),
      ]),
    )
  })

  test("prefers exact device instance matches for numbered switch profiles", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 40GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 20 | 20 | I12 | 核心区-10G 全域管理交换机-H3C S6805-54HF-1 | J08 | 管理POD-管理核心交换机-H3C S12508G-AF-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 管理网核心交换机",
                  "",
                  "| Unnamed: 0 | Unnamed: 1 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 管理核心交换机1 S-12508G-AF | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 4 | 36端口40G QSFP+光接口板 | 1 | QSFP+ 40G | 管理网汇聚交换机1 | S12508G-AF | 内部互联 |",
                  "| NaN | 管理核心交换机2 S-12508G-AF | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 4 | 36端口40G QSFP+光接口板 | 2 | QSFP+ 40G | 管理网汇聚交换机1 | S12508G-AF | 内部互联 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-switch-instance-precedence-1",
          projectName: "Template Switch Instance Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple workbook-derived port plan profiles matched device 管理POD-管理核心交换机-H3C S12508G-AF-1; selected '管理核心交换机1 S-12508G-AF' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointB: {
            deviceName: "管理POD-管理核心交换机-H3C S12508G-AF-1",
            portName: "4/1",
          },
        }),
      ]),
    )
  })

  test("prefers pod-specific grouped 25GE switch profiles over matching profiles from another pod", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机互联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 100GE双头光跳纤 | 多模光纤双芯 LC-LC | 1 | 10 | 10 | D07 | 业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-11 | J05 | 互联层-南北向汇聚交换机-H3C S12516G-AF-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 业务接入交换机",
                  "",
                  "| Unnamed: 0 | 业务POD SDN硬件接入交换机(25GE)奇数号 H3C S6850-56HF-H3 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个25GE SFP28接口 | 49 | 100GE(1310nm,10km,LR4,WDM,LC) | 核心交换机1 | S12516G-AF | 内部互联 |",
                  "| NaN | 业务POD SDN硬件接入交换机(25GE)偶数号 H3C S6850-56HF-H3 | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个25GE SFP28接口 | 49 | 100GE(1310nm,10km,LR4,WDM,LC) | 核心交换机1 | S12516G-AF | 内部互联 |",
                  "| NaN | DMZ POD SDN硬件接入交换机(25GE)奇数号 H3C S6850-56HF-H3 | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个25GE SFP28接口 | 53 | 100GE(1310nm,10km,LR4,WDM,LC) | 核心交换机1 | S12516G-AF | 内部互联 |",
                  "| NaN | DMZ POD SDN硬件接入交换机(25GE)偶数号 H3C S6850-56HF-H3 | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 |",
                  "| NaN | 1 | 48个25GE SFP28接口 | 53 | 100GE(1310nm,10km,LR4,WDM,LC) | 核心交换机1 | S12516G-AF | 内部互联 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-switch-scope-precedence-1",
          projectName: "Template Switch Scope Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple workbook-derived port plan profiles matched device 业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-11; selected '业务POD SDN硬件接入交换机(25GE)奇数号 H3C S6850-56HF-H3' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointA: {
            deviceName: "业务POD-SDN硬件接入交换机(25GE)-H3C S6850-56HF-11",
            portName: "1/49",
          },
          endpointB: {
            deviceName: "互联层-南北向汇聚交换机-H3C S12516G-AF-1",
            portName: expect.any(String),
          },
          linkType: "inter-switch",
        }),
      ]),
    )
  })

  test("prefers role-specific parameter-response power profiles for same-model aggregation switches", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/switch-parameters.xlsx", note: "设备参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 100GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 15 | 15 | J11 | 核心区-管理域防火墙-H3c SecPath M9000-CN04-1 | J05 | 互联层-南北向汇聚交换机-H3C S12516G-AF-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 南北向汇聚交换机 | H3C S12516G-AF | 2 | 440*857*931 | 21 | 233.87 | 360 | 6100 | 10252 |",
                  "| 东西向互联交换机 | H3C S12516G-AF | 2 | 440*857*931 | 21 | 218.53 | 360 | 5842 | 9894 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-power-role-precedence-1",
          projectName: "Template Power Role Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple direct parameter-response power profiles matched device 互联层-南北向汇聚交换机-H3C S12516G-AF-1; selected '南北向汇聚交换机' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "互联层-南北向汇聚交换机-H3C S12516G-AF-1",
          powerWatts: 6100,
          rackUnitHeight: 21,
        }),
      ]),
    )
  })

  test("prefers business pod sdn firewall port-plan and power profiles for core firewall devices", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
      { kind: "document" as const, ref: "fixtures/switch-parameters.xlsx", note: "设备参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 100GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 10 | 10 | G02 | 业务POD-核心防火墙-H3c SecPath M9000-x06-2 | G01 | 业务POD-SDN网关-H3C S12508G-AF-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 防火墙",
                  "",
                  "| Unnamed: 0 | 业务 POD SDN防火墙1 NS-SecPath M9000-X06 | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 | Unnamed: 8 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 0 | 子卡1--4端口100G以太网光接口(QSFP28) | 9 | 100GE LR4 | SDN网关1 | NS-SecPath M9000-X06 | 内部互联 | NaN |",
                  "| NaN | 业务 POD SDN防火墙2 NS-SecPath M9000-X06 | NaN | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 0 | 子卡1--4端口100G以太网光接口(QSFP28) | 13 | 100GE LR4 | SDN网关1 | NS-SecPath M9000-X06 | 内部互联 | NaN |",
                  "| NaN | 公网出口防火墙1（互联网接入防火墙） NS-SecPath M9000-X06 | NaN | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 0 | 子卡1--4端口100G以太网光接口(QSFP28) | 21 | 100GE LR4 | 出口路由器1 | NS-SecPath M9000-X06 | 内部互联 | NaN |",
                  "| NaN | 公网出口防火墙2（互联网接入防火墙） NS-SecPath M9000-X06 | NaN | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 0 | 子卡1--4端口100G以太网光接口(QSFP28) | 22 | 100GE LR4 | 出口路由器2 | NS-SecPath M9000-X06 | 内部互联 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 互联网接入防火墙 | H3c SecPath M9000-x06 | 4 | 440*857*263.9 | 6 | 80.67 | 120 | 1355 | 1710 |",
                  "| SDN核心防火墙 | H3c SecPath M9000-x06 | 8 | 440*857*263.9 | 6 | 80.67 | 120 | 1777 | 2111 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-firewall-profile-precedence-1",
          projectName: "Template Firewall Profile Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple workbook-derived port plan profiles matched device 业务POD-核心防火墙-H3c SecPath M9000-x06-2; selected '业务 POD SDN防火墙1 NS-SecPath M9000-X06' using longest-key precedence.",
    )
    expect(result.warnings).not.toContain(
      "Multiple direct parameter-response power profiles matched device 业务POD-核心防火墙-H3c SecPath M9000-x06-2; selected '互联网接入防火墙' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "业务POD-核心防火墙-H3c SecPath M9000-x06-2",
          powerWatts: 1777,
          rackUnitHeight: 6,
        }),
      ]),
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointA: {
            deviceName: "业务POD-核心防火墙-H3c SecPath M9000-x06-2",
            portName: "0/13",
          },
          endpointB: {
            deviceName: "业务POD-SDN网关-H3C S12508G-AF-2",
            portName: expect.any(String),
          },
        }),
      ]),
    )
  })

  test("prefers model-matched out-of-band tor profiles over generic management switch titles", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | H14 | 业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1 |",
                  "",
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 2 | 10GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 15 | 15 | H14 | 业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1 | J11 | 管理POD-管理汇聚交换机-H3C S12508G-AF-1 |",
                  "| 3 | 10GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 12 | 12 | H14 | 业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1 | I11 | 管理POD-管理汇聚交换机-H3C S12508G-AF-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## 管理交换机",
                  "",
                  "| Unnamed: 0 | POD内管理接入交换机(10GE)奇数号 S5560X-54C-EI | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 | Unnamed: 8 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 1 | 48个GE接口 | 41-42 | GE电口 | 千兆带内管理TOR(GE)2 | S5560X-54C-EI | keepalive | NaN |",
                  "| NaN | 千兆带外管理IPMI(GE) S5560X-54C-EI | NaN | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 1 | 48个GE接口 | 1-48 | GE电口 | 服务器 | 服务器 | IPMI网络 | NaN |",
                  "| NaN | NaN | 4个10GE SFP+接口 | 49 | 10GE LX(1310nm,10km,LC) | 管理汇聚交换机1 | S12508G-AF | 内部互联 | NaN |",
                  "| NaN | NaN | NaN | 50 | 10GE LX(1310nm,10km,LC) | 管理汇聚交换机2 | S12508G-AF | 内部互联 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-oob-tor-precedence-1",
          projectName: "Template OOB TOR Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Port plan matched device 业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1, but no remaining oob-mgmt port was available in workbook-derived assignments. Falling back to synthesized port naming.",
    )
    expect(result.warnings).not.toContain(
      "Port plan matched device 业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1, but no remaining uplink port was available in workbook-derived assignments. Falling back to synthesized port naming.",
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointB: {
            deviceName: "业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1",
            portName: "1/1",
          },
          linkType: "oob-mgmt",
        }),
        expect.objectContaining({
          endpointA: {
            deviceName: "业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1",
            portName: "1/49",
          },
          linkType: "uplink",
        }),
        expect.objectContaining({
          endpointA: {
            deviceName: "业务POD-千兆带外管理TOR-H3C S5560X-54C-EI-1",
            portName: "1/50",
          },
          linkType: "uplink",
        }),
      ]),
    )
  })

  test("binds numbered business-pod sdn gateway devices to the matching gateway profile", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/port-plan.xlsx", note: "Port plan workbook" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机上联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 100GE双头光跳纤 | 单模光纤双芯 LC-LC | 1 | 15 | 15 | G01 | 业务POD-SDN网关-H3C S12508G-AF-2 | G02 | 业务POD-核心防火墙-H3c SecPath M9000-x06-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## SDN网关",
                  "",
                  "| Unnamed: 0 | 业务POD SDN网关1 S12508G-AF | Unnamed: 2 | Unnamed: 3 | Unnamed: 4 | Unnamed: 5 | Unnamed: 6 | Unnamed: 7 | Unnamed: 8 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 2 | 36端口100G以太网光接口模块(QSFP28)(TE) | 17 | 100GE LR4 | 业务POD SDN网关2 | LS-12516G-AF | 内部互联 | NaN |",
                  "| NaN | 业务POD SDN网关2 S12508G-AF | NaN | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 2 | 36端口100G以太网光接口模块(QSFP28)(TE) | 25 | 100GE LR4 | 业务POD SDN网关1 | LS-12516G-AF | 内部互联 | NaN |",
                  "| NaN | DMZ POD SDN网关1 S12508G-AF | NaN | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| NaN | 2 | 36端口100G以太网光接口模块(QSFP28)(TE) | 31 | 100GE LR4 | DMZ POD SDN网关2 | LS-12516G-AF | 内部互联 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-sdn-gateway-instance-1",
          projectName: "Template SDN Gateway Instance Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      "Multiple workbook-derived port plan profiles matched device 业务POD-SDN网关-H3C S12508G-AF-2; selected '业务POD SDN网关1 S12508G-AF' using longest-key precedence.",
    )
    expect(result.draftInput.structuredInput.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpointA: {
            deviceName: "业务POD-SDN网关-H3C S12508G-AF-2",
            portName: "2/25",
          },
          endpointB: {
            deviceName: "业务POD-核心防火墙-H3c SecPath M9000-x06-2",
            portName: expect.any(String),
          },
          linkType: "uplink",
        }),
      ]),
    )
  })

  test("prefers parameter-response power over rack-layout fallback power for the same device", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
      { kind: "document" as const, ref: "fixtures/inventory.xlsx", note: "Inventory workbook" },
      { kind: "document" as const, ref: "fixtures/server-parameters.xlsx", note: "Server 参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | 1000 | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 编号 | 项目 | 产品型号/编号 | 产品描述（中文） | 单位 | 数量（a） | 备注 | 调整后数量 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1.1.10 | B1H服务器 | NF5280-M7-A0-R0-00 | server | 台 | 1 | NaN | 1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[3],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| B1H服务器 | CS5280H3 | 1 | 482.4*723.4*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-power-precedence-1",
          projectName: "Template Power Precedence Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
      ]),
    )
  })

  test("overrides rack-layout 1U placeholders with parameter-response rack unit height", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const parameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/服务器参数应答表.xlsx",
      note: "服务器参数应答表",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | F列02柜 | 机柜(F02） | Unnamed: 3 | 7kw |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | 1339 | 业务POD-C5服务器-NF8260-M7-A0-R0-00-12 | 5 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: parameterSource,
                markdown: [
                  "## Sheet1",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| C5服务器 | NF8260-M7-A0-R0-00 | 1 | 482*870*87 | 2 | 24 | 32.6 | 1339 | 2000 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-rack-unit-override-1",
          projectName: "Template Rack Unit Override Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "业务POD-C5服务器-NF8260-M7-A0-R0-00-12",
          rackPosition: expect.any(Number),
          rackUnitHeight: 2,
          powerWatts: 1339,
        }),
      ]),
    )
  })

  test("auto-discovers parameter-response support workbooks and matches power by English model when Chinese names differ", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "服务器参数应答表.xlsx"), "server parameter workbook")
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const discoveredParameterSources = [
      {
        kind: "document" as const,
        ref: "test/设备参数应答表/服务器参数应答表.xlsx",
        note: "服务器参数应答表",
      },
      {
        kind: "document" as const,
        ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
        note: "设备参数应答表-华三0202",
      },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-未知设备-ABC1234-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                  "| NaN | NaN | 业务POD-未知设备-ABC1234-1 | 14 | NaN |",
                  "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: discoveredParameterSources[0],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 其他服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
              {
                sourceRef: discoveredParameterSources[1],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-direct-parameter-model-1",
          projectName: "Template Direct Parameter Model Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.summary).toEqual({
      parsedSourceCount: 2,
      rackCount: 1,
      deviceCount: 3,
      linkCount: 2,
    })
    expect(result.warnings).toContain(
      "Discovered 2 parameter-response support workbook(s) under test/设备参数应答表 for deterministic power hydration.",
    )
    expect(result.warnings).not.toContain(
      "No device parameter-response workbook was recognized, so device power could not be resolved from required user input.",
    )
    expect(result.warnings).toContain(
      "No parameter-response workbook row matched device 业务POD-未知设备-ABC1234-1 by deterministic model/title rules, so device power remains unresolved and requires user confirmation.",
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
        expect.objectContaining({ name: "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11", powerWatts: 55 }),
        expect.objectContaining({ name: "业务POD-未知设备-ABC1234-1", powerWatts: undefined }),
      ]),
    )
  })

  test("does not supplement parameter-response support from the bundle when the real support folder exists", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "服务器参数应答表.xlsx"), "server parameter workbook")

    const packagedBundleDirectory = join(workspace, "dist", "runtime-assets", "converted-markdown")
    mkdirSync(packagedBundleDirectory, { recursive: true })
    writeFileSync(join(packagedBundleDirectory, "cabling.md"), [
      "## 服务器带内带外连线",
      "",
      "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
      "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "rack-layout.md"), [
      "## Sheet1",
      "",
      "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
      "| --- | --- | --- | --- | --- |",
      "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
      "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "server-parameters.md"), [
      "## Sheet1",
      "",
      "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| B1H服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 892 | 1300 |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "switch-parameters.md"), [
      "## 设备参数表",
      "",
      "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "convertedDocuments.json"), JSON.stringify({
      convertedDocuments: [
        {
          kind: "document",
          ref: "fixtures/cabling-template.xlsx",
          note: "Cable planning template",
          markdownRef: "test/converted-markdown/cabling.md",
        },
        {
          kind: "document",
          ref: "fixtures/rack-layout-template.xlsx",
          note: "Rack layout template",
          markdownRef: "test/converted-markdown/rack-layout.md",
        },
        {
          kind: "document",
          ref: "test/设备参数应答表/服务器参数应答表.xlsx",
          note: "服务器参数应答表",
          markdownRef: "test/converted-markdown/server-parameters.md",
        },
        {
          kind: "document",
          ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
          note: "设备参数应答表-华三0202",
          markdownRef: "test/converted-markdown/switch-parameters.md",
        },
      ],
    }, null, 2))

    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: { kind: "document", ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: { kind: "document", ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                  "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: { kind: "document", ref: "test/设备参数应答表/服务器参数应答表.xlsx", note: "服务器参数应答表" },
                markdown: [
                  "## Sheet1",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| B1H服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-real-folder-trust-boundary-1",
          projectName: "Template Real Folder Trust Boundary Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: [
          { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
          { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
        ],
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).toContain(
      "Discovered 1 parameter-response support workbook(s) under test/设备参数应答表 for deterministic power hydration.",
    )
    expect(result.warnings).not.toContain(
      "Recovered 1 parameter-response support workbook reference(s) from the deterministic converted-markdown bundle.",
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
        expect.objectContaining({ name: "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11", powerWatts: undefined }),
      ]),
    )
  })

  test("recovers parameter-response support refs from packaged runtime assets when the support Excel folder is absent", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const packagedBundleDirectory = join(workspace, "dist", "runtime-assets", "converted-markdown")
    mkdirSync(packagedBundleDirectory, { recursive: true })

    writeFileSync(join(packagedBundleDirectory, "cabling.md"), [
      "## 服务器带内带外连线",
      "",
      "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
      "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "rack-layout.md"), [
      "## Sheet1",
      "",
      "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
      "| --- | --- | --- | --- | --- |",
      "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
      "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "server-parameters.md"), [
      "## Sheet1",
      "",
      "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| B1H服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 892 | 1300 |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "switch-parameters.md"), [
      "## 设备参数表",
      "",
      "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
    ].join("\n"))
    writeFileSync(join(packagedBundleDirectory, "convertedDocuments.json"), JSON.stringify({
      convertedDocuments: [
        {
          kind: "document",
          ref: "fixtures/cabling-template.xlsx",
          note: "Cable planning template",
          markdownRef: "test/converted-markdown/cabling.md",
        },
        {
          kind: "document",
          ref: "fixtures/rack-layout-template.xlsx",
          note: "Rack layout template",
          markdownRef: "test/converted-markdown/rack-layout.md",
        },
        {
          kind: "document",
          ref: "test/设备参数应答表/服务器参数应答表.xlsx",
          note: "服务器参数应答表",
          markdownRef: "test/converted-markdown/server-parameters.md",
        },
        {
          kind: "document",
          ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
          note: "设备参数应答表-华三0202",
          markdownRef: "test/converted-markdown/switch-parameters.md",
        },
      ],
    }, null, 2))

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-packaged-parameter-support-1",
          projectName: "Template Packaged Parameter Support Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: [
          { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
          { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
        ],
      },
      pluginConfig,
      rootDirectory: workspace,
    })

    expect(result.warnings).toContain(
      "Recovered 2 parameter-response support workbook reference(s) from the deterministic converted-markdown bundle.",
    )
    expect(result.warnings).not.toContain(
      "Discovered 2 parameter-response support workbook(s) under test/设备参数应答表 for deterministic power hydration.",
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
        expect.objectContaining({ name: "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11", powerWatts: 55 }),
      ]),
    )
  })

  test("does not guess power across conflicting explicit server family titles even when the English model matches", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "服务器参数应答表.xlsx"), "server parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const discoveredParameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/服务器参数应答表.xlsx",
      note: "服务器参数应答表",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: discoveredParameterSource,
                markdown: [
                  "## Sheet1",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| C1H服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 861 | 1300 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-direct-parameter-conflict-1",
          projectName: "Template Direct Parameter Conflict Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: undefined }),
      ]),
    )
    expect(result.warnings).toContain(
      "No parameter-response workbook row matched device 业务POD-B1H服务器-CS5280H3-1 by deterministic model/title rules, so device power remains unresolved and requires user confirmation.",
    )
  })

  test("does not warn unresolved power when rack-layout already provided deterministic power", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const discoveredParameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
      note: "设备参数应答表-华三0202",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | F02 | 业务POD-全流量安全监测（探针）-Tss10000-S85-2 | F02 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | F列02柜 | 机柜(F02） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | 500 | 业务POD-全流量安全监测（探针）-Tss10000-S85-2 | 41 | NaN |",
                  "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: discoveredParameterSource,
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-existing-power-no-warning-1",
          projectName: "Template Existing Power No Warning Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-全流量安全监测（探针）-Tss10000-S85-2", powerWatts: 500 }),
      ]),
    )
    expect(result.warnings).not.toContain(
      "No parameter-response workbook row matched device 业务POD-全流量安全监测（探针）-Tss10000-S85-2 by deterministic model/title rules, so device power remains unresolved and requires user confirmation.",
    )
  })

  test("synthesizes adjacent placement for a redundant pair that initially shares one preferred rack", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "服务器参数应答表.xlsx"), "server parameter workbook")
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const parameterSource = { kind: "document" as const, ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx", note: "设备参数应答表-华三0202" }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | E15 | 对端设备-1 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-12 | E14 | 对端设备-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列14柜 | 机柜(E14） | Unnamed: 3 | 7kw | Unnamed: 5 | E列15柜 | 机柜(E15） | Unnamed: 8 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                ].join("\n"),
              },
              {
                sourceRef: parameterSource,
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 2 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-generated-placement-pair-1",
          projectName: "Template Generated Placement Pair Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    const switchA = result.draftInput.structuredInput.devices.find((device) => device.name === "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11")
    const switchB = result.draftInput.structuredInput.devices.find((device) => device.name === "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-12")
    const racks = result.draftInput.structuredInput.racks

    expect(switchA).toEqual(expect.objectContaining({ rackUnitHeight: 1, rackPosition: expect.any(Number) }))
    expect(switchB).toEqual(expect.objectContaining({ rackUnitHeight: 1, rackPosition: expect.any(Number) }))
    expect(switchA?.rackName).not.toBe(switchB?.rackName)
    expect([switchA?.rackName, switchB?.rackName].sort()).toEqual(["E14", "E15"])
    expect(racks.find((rack) => rack.name === "E15")).toEqual(expect.objectContaining({ adjacentRackIds: expect.arrayContaining(["E14"]) }))
  })

  test("does not co-locate a redundant pair when no adjacent rack candidate exists", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "服务器参数应答表.xlsx"), "server parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const parameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
      note: "设备参数应答表-华三0202",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | J01 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | H03 | 对端设备-1 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | J01 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-12 | H03 | 对端设备-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | H列03柜 | 机柜(H03） | Unnamed: 3 | 7kw | Unnamed: 5 | J列01柜 | 机柜(J01） | Unnamed: 8 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                ].join("\n"),
              },
              {
                sourceRef: parameterSource,
                markdown: [
                  "## Sheet1",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 2 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-nonadjacent-pair-1",
          projectName: "Template Nonadjacent Pair Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    const switchA = result.draftInput.structuredInput.devices.find((device) => device.name === "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11")
    const switchB = result.draftInput.structuredInput.devices.find((device) => device.name === "业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-12")

    expect(switchA).toEqual(expect.objectContaining({ rackName: undefined, rackPosition: undefined }))
    expect(switchB).toEqual(expect.objectContaining({ rackName: undefined, rackPosition: undefined }))
    expect(result.warnings).toContain(
      "No adjacent rack or adjacent-column candidate satisfied deterministic placement constraints for redundant pair 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 / 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-12; rack positions remain unresolved and require user confirmation.",
    )
  })

  test("does not partially place a redundant pair when adjacent racks exist but one side has no free U space", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const parameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
      note: "设备参数应答表-华三0202",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E14 | 占位交换机-H3C S5560X-54C-EI-1 | H01 | 对端设备-0 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-干兆带内/带外管理TOR-H3C S5560X-54C-EI-11 | E14 | 对端设备-1 |",
                  "| 3 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-干兆带内/带外管理TOR-H3C S5560X-54C-EI-12 | E14 | 对端设备-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列14柜 | 机柜(E14） 1U | Unnamed: 3 | 7kw | Unnamed: 5 | E列15柜 | 机柜(E15） 1U | Unnamed: 8 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                ].join("\n"),
              },
              {
                sourceRef: parameterSource,
                markdown: [
                  "## Sheet1",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 干兆带内/带外管理TOR | H3C S5560X-54C-EI | 3 | 440*360*44 | 1 | 7.5 | 7.5 | 55 | 116 |",
                  "| 占位交换机 | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 1000 | 1160 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-adjacent-pair-no-space-1",
          projectName: "Template Adjacent Pair No Space Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: [...templateSources, parameterSource],
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    const switchA = result.draftInput.structuredInput.devices.find((device) => device.name === "业务POD-干兆带内/带外管理TOR-H3C S5560X-54C-EI-11")
    const switchB = result.draftInput.structuredInput.devices.find((device) => device.name === "业务POD-干兆带内/带外管理TOR-H3C S5560X-54C-EI-12")

    expect(switchA).toEqual(expect.objectContaining({ rackName: undefined, rackPosition: undefined }))
    expect(switchB).toEqual(expect.objectContaining({ rackName: undefined, rackPosition: undefined }))
    expect(result.warnings).toContain(
      "No adjacent rack or adjacent-column candidate satisfied deterministic placement constraints for redundant pair 业务POD-干兆带内/带外管理TOR-H3C S5560X-54C-EI-11 / 业务POD-干兆带内/带外管理TOR-H3C S5560X-54C-EI-12; rack positions remain unresolved and require user confirmation.",
    )
  })

  test("places a redundant pair into adjacent racks when only threshold-violating adjacent options exist", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const parameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
      note: "设备参数应答表-华三0202",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机互联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | J05 | 互联层-南北向汇聚交换机-H3C S12516G-AF-1 | I05 | 互联层-南北向汇聚交换机-H3C S12516G-AF-2 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | I列05柜 | 机柜(I05） 48U | Unnamed: 3 | 7kw | Unnamed: 5 | J列05柜 | 机柜(J05） 48U | Unnamed: 8 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                ].join("\n"),
              },
              {
                sourceRef: parameterSource,
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 南北向汇聚交换机 | H3C S12516G-AF | 2 | 440*857*931 | 21 | 233.87 | 360 | 6100 | 10252 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-adjacent-over-threshold-1",
          projectName: "Template Adjacent Over Threshold Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    const draft = await runDraftTopologyModel({
      input: result.draftInput,
      allowDocumentAssist: true,
    })
    const switchA = result.draftInput.structuredInput.devices.find((device) => device.name === "互联层-南北向汇聚交换机-H3C S12516G-AF-1")
    const switchB = result.draftInput.structuredInput.devices.find((device) => device.name === "互联层-南北向汇聚交换机-H3C S12516G-AF-2")

    expect(switchA).toEqual(expect.objectContaining({ rackPosition: expect.any(Number), rackUnitHeight: 21 }))
    expect(switchB).toEqual(expect.objectContaining({ rackPosition: expect.any(Number), rackUnitHeight: 21 }))
    expect([switchA?.rackName, switchB?.rackName].sort()).toEqual(["I05", "J05"])
    expect(draft.validationSummary.issues.map((issue) => issue.code)).toContain("rack_power_threshold_exceeded")
  })

  test("prefers a feasible rack with an empty adjacent rack for very high power devices", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const supportDirectory = join(workspace, "test", "设备参数应答表")
    mkdirSync(supportDirectory, { recursive: true })
    writeFileSync(join(supportDirectory, "设备参数应答表-华三0202.xlsx"), "switch parameter workbook")

    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const parameterSource = {
      kind: "document" as const,
      ref: "test/设备参数应答表/设备参数应答表-华三0202.xlsx",
      note: "设备参数应答表-华三0202",
    }
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 交换机互联表",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | I05 | 占位设备-H3C S5560X-54C-EI-1 | H01 | 对端设备-0 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | J05 | 互联层-南北向汇聚交换机-H3C S12516G-AF-1 | H01 | 对端设备-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | G列01柜 | 机柜(G01） 48U | Unnamed: 3 | 10kw | Unnamed: 5 | G列02柜 | 机柜(G02） 48U | Unnamed: 8 | 10kw | Unnamed: 10 | I列05柜 | 机柜(I05） 48U | Unnamed: 13 | 10kw | Unnamed: 15 | J列05柜 | 机柜(J05） 48U | Unnamed: 18 | 10kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | NaN | 55 | 占位设备-H3C S5560X-54C-EI-1 | 42 | NaN | NaN | NaN | NaN | NaN | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: parameterSource,
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 占位设备 | H3C S5560X-54C-EI | 1 | 440*360*44 | 1 | 7.5 | 7.5 | 7000 | 1160 |",
                  "| 南北向汇聚交换机 | H3C S12516G-AF | 1 | 440*857*931 | 21 | 233.87 | 360 | 6100 | 10252 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-thermal-preference-1",
          projectName: "Template Thermal Preference Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: [...templateSources, parameterSource],
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    const switchA = result.draftInput.structuredInput.devices.find((device) => device.name === "互联层-南北向汇聚交换机-H3C S12516G-AF-1")
    expect(switchA).toEqual(expect.objectContaining({ rackPosition: expect.any(Number), rackUnitHeight: 21 }))
    expect(switchA?.rackName).not.toBe("J05")
  })

  test("treats multi-letter rack rows as adjacent columns when generating adjacency metadata", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | AA列01柜 | 机柜(AA01） 48U | Unnamed: 3 | 7kw | Unnamed: 5 | AB列01柜 | 机柜(AB01） 48U | Unnamed: 8 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-multiletter-rack-adjacency-1",
          projectName: "Template Multi-Letter Rack Adjacency Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.racks.find((rack) => rack.name === "AA01")).toEqual(
      expect.objectContaining({ adjacentColumnRackIds: expect.arrayContaining(["AB01"]) }),
    )
    expect(result.draftInput.structuredInput.racks.find((rack) => rack.name === "AB01")).toEqual(
      expect.objectContaining({ adjacentColumnRackIds: expect.arrayContaining(["AA01"]) }),
    )
  })

  test("places higher-power devices first so a feasible under-threshold rack distribution is chosen", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | A列01柜 | 机柜(A01） 48U | Unnamed: 3 | 7kw | Unnamed: 5 | A列02柜 | 机柜(A02） 48U | Unnamed: 8 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 5000 | 大功率设备-1 | 10 | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 1000 | 小功率设备-1 | 20 | NaN | NaN | NaN | NaN | NaN | NaN |",
                  "| NaN | 1000 | 小功率设备-2 | 30 | NaN | NaN | NaN | NaN | NaN | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-power-order-1",
          projectName: "Template Power Order Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    const draft = await runDraftTopologyModel({
      input: result.draftInput,
      allowDocumentAssist: true,
    })
    const devices = result.draftInput.structuredInput.devices
    const powerByRack = devices.reduce<Record<string, number>>((acc, device) => {
      if (!device.rackName || typeof device.powerWatts !== "number") {
        return acc
      }
      acc[device.rackName] = (acc[device.rackName] ?? 0) + device.powerWatts
      return acc
    }, {})

    expect(powerByRack).toEqual({
      A01: 5000,
      A02: 2000,
    })
    expect(draft.validationSummary.issues.map((issue) => issue.code)).not.toContain("rack_power_threshold_exceeded")
  })

  test("preserves an explicit non-standard rack U value instead of defaulting to 48U", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | Z列01柜 | 机柜(Z01 45U） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 示例设备-1 | 17 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-rack-u-override-1",
          projectName: "Template Rack U Override Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.racks).toEqual([
      expect.objectContaining({ name: "Z01", uHeight: 45, maxPowerKw: 7 }),
    ])
    expect(result.warnings).not.toContain(
      "Defaulted rack Z01 to 48U because no explicit rack height was provided for this project.",
    )
  })

  test("roundtrips template-derived structuredInput through draft_topology_model without duplicate Chinese IDs", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      {
        kind: "document" as const,
        ref: "fixtures/cabling-template.xlsx",
        note: "Cable planning template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/rack-layout-template.xlsx",
        note: "Rack layout template",
      },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | F01 | 业务POD-C1服务器-1 | F01 | 业务POD-千兆带内管理TOR-1 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 10 | 10 | F01 | 业务POD-C1服务器-1 | F02 | 业务POD-千兆带外管理TOR-1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | F列01柜 | 机柜(F01） | Unnamed: 3 | 7kw | Unnamed: 5 | Unnamed: 6 | F列02柜 | 机柜(F02） | Unnamed: 9 | 7kw |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 350 | 业务POD-千兆带内管理TOR-1 | 42 | NaN | NaN | NaN | 350 | 业务POD-千兆带外管理TOR-1 | 42 | NaN |",
                  "| NaN | 900 | 业务POD-C1服务器-1 | 10 | NaN | NaN | NaN | NaN | NaN | 10 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const extraction = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-roundtrip-1",
          projectName: "Template Roundtrip Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout", "device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })
    const draft = await runDraftTopologyModel({
      input: extraction.draftInput,
      allowDocumentAssist: true,
    })

    expect(draft.validationSummary.issues.map((issue) => issue.code)).not.toContain("duplicate_device_id")
  })

  test("keeps imported power and default rack facts on the inferred draft path", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
      { kind: "document" as const, ref: "fixtures/inventory.xlsx", note: "Inventory workbook" },
      { kind: "document" as const, ref: "fixtures/server-parameters.xlsx", note: "Server 参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 编号 | 项目 | 产品型号/编号 | 产品描述（中文） | 单位 | 数量（a） | 备注 | 调整后数量 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1.1.10 | B1H服务器 | NF5280-M7-A0-R0-00 | server | 台 | 1 | NaN | 1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[3],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| B1H服务器 | CS5280H3 | 1 | 482*723*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const extraction = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-draft-confidence-1",
          projectName: "Template Draft Confidence Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })
    const draft = await runDraftTopologyModel({
      input: extraction.draftInput,
      allowDocumentAssist: true,
    })

    expect(extraction.draftInput.structuredInput.racks[0]?.statusConfidence).toBe("inferred")
    expect(extraction.draftInput.structuredInput.devices[0]?.statusConfidence).toBe("inferred")
    expect(draft.validationSummary.issues.map((issue) => issue.code)).toContain("physical_fact_not_confirmed")
  })

  test("warns when inventory is provided for imported devices but no parameter-response workbook is available for power resolution", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      {
        kind: "document" as const,
        ref: "fixtures/cabling-template.xlsx",
        note: "Cable planning template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/rack-layout-template.xlsx",
        note: "Rack layout template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/inventory.xlsx",
        note: "Inventory workbook",
      },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                  "| NaN | NaN | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 | 42 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 编号 | 项目 | 产品型号/编号 | 产品描述（中文） | 单位 | 数量（a） | 备注 | 调整后数量 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1.1.20 | 业务/存储接入交换机（10G） | H3C S6805-54HF | Switch | 台 | 14 | NaN | 14 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-inventory-warning-1",
          projectName: "Template Inventory Warning Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).toContain(
      "No device parameter-response workbook was recognized, so device power could not be resolved from required user input.",
    )
  })

  test("fills power by parameter-response model match even when inventory has no matching row", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
      { kind: "document" as const, ref: "fixtures/inventory.xlsx", note: "Inventory workbook" },
      { kind: "document" as const, ref: "fixtures/server-parameters.xlsx", note: "Server 参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 未登记服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 未登记服务器-CS5280H3-1 | 17 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 编号 | 项目 | 产品型号/编号 | 产品描述（中文） | 单位 | 数量（a） | 备注 | 调整后数量 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1.1.10 | B1H服务器 | NF5280-M7-A0-R0-00 | server | 台 | 1 | NaN | 1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[3],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| B1H服务器 | CS5280H3 | 1 | 482.4*723.4*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-inventory-match-warning-1",
          projectName: "Template Inventory Match Warning Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "未登记服务器-CS5280H3-1", powerWatts: 892 }),
      ]),
    )
    expect(result.warnings).not.toContain(
      "No inventory workbook row matched device 未登记服务器-CS5280H3-1, so device power remains unresolved until the project provides a matching inventory entry.",
    )
  })

  test("fills power by direct parameter-response model match when inventory title differs", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      { kind: "document" as const, ref: "fixtures/cabling-template.xlsx", note: "Cable planning template" },
      { kind: "document" as const, ref: "fixtures/rack-layout-template.xlsx", note: "Rack layout template" },
      { kind: "document" as const, ref: "fixtures/inventory.xlsx", note: "Inventory workbook" },
      { kind: "document" as const, ref: "fixtures/server-parameters.xlsx", note: "Server 参数应答表" },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 业务POD-B1H服务器-CS5280H3-1 | E15 | 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | NaN |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | NaN | 业务POD-B1H服务器-CS5280H3-1 | 17 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## Sheet1",
                  "",
                  "| 编号 | 项目 | 产品型号/编号 | 产品描述（中文） | 单位 | 数量（a） | 备注 | 调整后数量 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1.1.10 | B1H服务器 | CS5280H3 | server | 台 | 1 | NaN | 1 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[3],
                markdown: [
                  "## 设备参数表",
                  "",
                  "| 设备名称 | 设备型号 | 设备数量 | 设备尺寸（宽*深*高mm） | 设备大小(U) | 设备实配重量(KG) | 设备满配重量(KG) | 设备实配运行功耗（W） | 设备满配运行功耗（W） |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 其他服务器 | CS5280H3 | 1 | 482.4*723.4*87 | 2 | 23 | 33 | 892 | 1300 |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-parameter-match-warning-1",
          projectName: "Template Parameter Match Warning Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
      ]),
    )
    expect(result.warnings).not.toContain(
      "Inventory matched device 业务POD-B1H服务器-CS5280H3-1, but no parameter-response workbook row provided deterministic power for it.",
    )
  })

  test("parses duplicated rack power headers like 7kw.1 as 7kW instead of 7.1kW", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      {
        kind: "document" as const,
        ref: "fixtures/rack-layout-template.xlsx",
        note: "Rack layout template",
      },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | F列01柜 | 机柜(F01） | Unnamed: 3 | 7kw | Unnamed: 5 | Unnamed: 6 | F列02柜 | 机柜(F02） | Unnamed: 9 | 7kw.1 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | 350 | 业务POD-千兆带内管理TOR-1 | 42 | NaN | NaN | NaN | 350 | 业务POD-千兆带外管理TOR-1 | 42 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-rack-power-1",
          projectName: "Template Rack Power Example",
          scopeType: "data-center",
          artifactRequests: ["device-rack-layout"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.racks).toEqual([
      expect.objectContaining({ name: "F01", maxPowerKw: 7 }),
      expect.objectContaining({ name: "F02", maxPowerKw: 7 }),
    ])
  })

  test("matches project-specific device names to port-plan sections via family/model identity instead of exact names", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      {
        kind: "document" as const,
        ref: "fixtures/cabling-template.xlsx",
        note: "Cable planning template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/rack-layout-template.xlsx",
        note: "Rack layout template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/port-plan.xlsx",
        note: "Port plan workbook",
      },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 某项目-管理域节点-B1H服务器-CS5280H3-A01 | E15 | 某项目-带内管理TOR-H3C S5560X-54C-EI-A11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | 7kw |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | 1000 | 某项目-管理域节点-B1H服务器-CS5280H3-A01 | 17 | NaN |",
                  "| NaN | 55 | 某项目-带内管理TOR-H3C S5560X-54C-EI-A11 | 42 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## B1-H服务器",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 3 | 2端口GE电接口网卡 | 0 | 1G | 管理接入 | H3C S5560X-54C-EI | 千兆管理网络 | NaN |",
                  "",
                  "## 千兆带内管理TOR",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1 | 48个GE接口 | 1-48 | 1G | 服务器 | 服务器 | 千兆管理网络 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-name-flex-1",
          projectName: "Template Name Flex Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "某项目-管理域节点-B1H服务器-CS5280H3-A01",
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "3/0", portType: "inband-mgmt" }),
          ]),
        }),
        expect.objectContaining({
          name: "某项目-带内管理TOR-H3C S5560X-54C-EI-A11",
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "1/1", portType: "inband-mgmt" }),
          ]),
        }),
      ]),
    )
  })

  test("matches A设备/B设备 workbook profiles to project-specific A01/B01 device names", async () => {
    const workspace = createTempWorkspace()
    const pluginConfig = loadPluginConfig(process.cwd())
    const templateSources = [
      {
        kind: "document" as const,
        ref: "fixtures/cabling-template.xlsx",
        note: "Cable planning template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/rack-layout-template.xlsx",
        note: "Rack layout template",
      },
      {
        kind: "document" as const,
        ref: "fixtures/port-plan.xlsx",
        note: "Port plan workbook",
      },
    ]
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: [
              {
                sourceRef: templateSources[0],
                markdown: [
                  "## 服务器带内带外连线",
                  "",
                  "| 线缆编号 | 线缆名称 | 线缆程式 | 线缆 条数 | 线缆长度 (米) | 线缆 总长度 （米） | 起始端 | Unnamed: 7 | 目的端 | Unnamed: 9 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| NaN | NaN | NaN | NaN | NaN | NaN | 机架 | 设备名称/型号 | 机架 | 设备名称/型号 |",
                  "| 1 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 某项目-B1H服务器-CS5280H3-A01 | E15 | 某项目-带内管理TOR-A11 |",
                  "| 2 | 以太网电缆 | F/UTP六类屏蔽线 | 1 | 5 | 5 | E15 | 某项目-B1H服务器-CS5280H3-B01 | E15 | 某项目-带内管理TOR-B11 |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[1],
                markdown: [
                  "## Sheet1",
                  "",
                  "| Unnamed: 0 | E列15柜 | 机柜(E15） | Unnamed: 3 | 7kw |",
                  "| --- | --- | --- | --- | --- |",
                  "| NaN | 1000 | 某项目-B1H服务器-CS5280H3-A01 | 17 | NaN |",
                  "| NaN | 1000 | 某项目-B1H服务器-CS5280H3-B01 | 14 | NaN |",
                  "| NaN | 55 | 某项目-带内管理TOR-A11 | 42 | NaN |",
                  "| NaN | 55 | 某项目-带内管理TOR-B11 | 39 | NaN |",
                ].join("\n"),
              },
              {
                sourceRef: templateSources[2],
                markdown: [
                  "## B1-H服务器A设备",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 3 | 2端口GE电接口网卡 | 0 | 1G | 管理接入 | H3C S5560X-54C-EI | 千兆管理网络 | NaN |",
                  "",
                  "## B1-H服务器B设备",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 3 | 2端口GE电接口网卡 | 0 | 1G | 管理接入 | H3C S5560X-54C-EI | 千兆管理网络 | NaN |",
                  "",
                  "## 带内管理TORA设备",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1 | 48个GE接口 | 1-48 | 1G | 服务器 | 服务器 | 千兆管理网络 | NaN |",
                  "",
                  "## 带内管理TORB设备",
                  "",
                  "| 板卡编号 | 板卡类型 | 端口编号 | 端口类型 | 接至 | 电路开通方向 | 主要用途 | 备注 |",
                  "| --- | --- | --- | --- | --- | --- | --- | --- |",
                  "| 1 | 48个GE接口 | 1-48 | 1G | 服务器 | 服务器 | 千兆管理网络 | NaN |",
                ].join("\n"),
              },
            ],
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement: {
          id: "req-template-parity-1",
          projectName: "Template Parity Example",
          scopeType: "data-center",
          artifactRequests: ["device-cabling-table"],
          sourceRefs: [],
          statusConfidence: "confirmed",
        },
        documentSources: templateSources,
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: workspace,
        worktree: workspace,
      }),
      rootDirectory: workspace,
    })

    expect(result.warnings).not.toContain(
      expect.stringContaining("Multiple workbook-derived port plan profiles matched device"),
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "某项目-B1H服务器-CS5280H3-A01",
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "3/0", portType: "inband-mgmt" }),
          ]),
        }),
        expect.objectContaining({
          name: "某项目-B1H服务器-CS5280H3-B01",
          ports: expect.arrayContaining([
            expect.objectContaining({ name: "3/0", portType: "inband-mgmt" }),
          ]),
        }),
      ]),
    )
  })

  test("replays the local real-template converted markdown bundle when it is available", async () => {
    const rootDirectory = process.cwd()
    const convertedDocumentManifest = loadLocalConvertedMarkdownManifest(rootDirectory)
    if (!convertedDocumentManifest) {
      return
    }
    const primaryDocumentManifest = convertedDocumentManifest.filter(
      (document) => !document.ref.includes("设备参数应答表/"),
    )

    const pluginConfig = loadPluginConfig(rootDirectory)
    const { client } = createFakeCoordinatorClient({
      promptTexts: [
        JSON.stringify({
          workerId: "document-source-markdown",
          status: "success",
          output: {
            convertedDocuments: convertedDocumentManifest,
            conversionWarnings: [],
          },
          recommendations: [],
        }),
      ],
    })

    const requirement = {
      id: "req-real-template-local-bundle-1",
      projectName: "Local Real Template Bundle",
      scopeType: "data-center" as const,
      artifactRequests: [
        "device-rack-layout",
        "device-cabling-table",
        "device-port-plan",
        "device-port-connection-table",
      ],
      sourceRefs: [],
      statusConfidence: "confirmed" as const,
    }

    const result = await runExtractStructuredInputFromTemplates({
      input: {
        requirement,
        documentSources: primaryDocumentManifest.map((document) => ({
          kind: document.kind,
          ref: document.ref,
          note: document.note,
        })),
      },
      pluginConfig,
      runtime: createWorkerRuntimeContext(client, {
        directory: rootDirectory,
        worktree: rootDirectory,
      }),
      rootDirectory,
    })

    expect(result.summary).toEqual({
      parsedSourceCount: 3,
      rackCount: 26,
      deviceCount: 52,
      linkCount: 49,
    })
    expect(result.warnings).toContain(
      "Rack layout import currently defaults device rackUnitHeight to 1U when workbook markdown does not preserve merged-cell height.",
    )
    expect(result.warnings).toContain(
      "Discovered 4 parameter-response support workbook(s) under test/设备参数应答表 for deterministic power hydration.",
    )
    expect(result.warnings).not.toContain(
      "No project-bound inventory workbook was recognized, so device power could not be resolved from required user input.",
    )
    expect(result.warnings).not.toContain(
      "No device parameter-response workbook was recognized, so device power could not be resolved from required user input.",
    )
    expect(result.warnings).toEqual(
      expect.not.arrayContaining([
        expect.stringContaining("Multiple workbook-derived port plan profiles matched device 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11"),
        expect.stringContaining("Multiple direct parameter-response power profiles matched device 业务POD-千兆带内管理TOR-H3C S5560X-54C-EI-11"),
      ]),
    )
    expect(result.draftInput.structuredInput.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "业务POD-B1H服务器-CS5280H3-1", powerWatts: 892 }),
        expect.objectContaining({ name: "业务POD-SDN千兆带内管理TOR-H3C S5560X-54C-EI-1", powerWatts: 55 }),
        expect.objectContaining({ name: "业务POD-C5服务器-NF8260-M7-A0-R0-00-12", powerWatts: 1339 }),
      ]),
    )

    const draft = await runDraftTopologyModel({
      input: result.draftInput,
      allowDocumentAssist: true,
    })

    expect(draft.validationSummary.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "physical_fact_not_confirmed",
        "plane_link_port_type_mismatch",
        "rack_power_threshold_exceeded",
      ]),
    )
    expect(draft.validationSummary.issues.map((issue) => issue.code)).not.toContain("device_power_missing")
    expect(draft.validationSummary.issues.map((issue) => issue.code)).not.toContain("device_rack_position_required")
    expect(draft.validationSummary.issues.map((issue) => issue.code)).not.toContain("device_rack_unit_height_required")
  })
})
