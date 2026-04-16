import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
          rackPosition: 10,
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
          rackPosition: 42,
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

  test("warns when a device cannot be matched to any inventory workbook row", async () => {
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

    expect(result.warnings).toContain(
      "No inventory workbook row matched device 未登记服务器-CS5280H3-1, so device power remains unresolved until the project provides a matching inventory entry.",
    )
  })

  test("warns when inventory matches but no parameter-response row resolves device power", async () => {
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

    expect(result.warnings).toContain(
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
})
