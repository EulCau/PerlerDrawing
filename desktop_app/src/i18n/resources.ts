export const resources = {
  "zh-CN": {
    translation: {
      app: {
        name: "PerlerDrawing",
        desktop: "Desktop",
        homeLabel: "返回启动页",
      },
      status: {
        offline: "离线优先",
        foundationTitle: "应用基础壳已就绪",
        foundationDescription: "语言, 主题和桌面运行时已经接通.",
        nextStep: "下一步",
        planned: "计划中",
      },
      preferences: {
        language: "界面语言",
        chinese: "使用中文",
        english: "Use English",
        theme: "界面主题",
        light: "使用浅色主题",
        dark: "使用深色主题",
        system: "跟随系统主题",
      },
      home: {
        eyebrow: "离线拼豆图纸工作台",
        title: "把灵感变成可实际拼制的图纸.",
        description:
          "从图片, CSV 或空白画布开始. 使用真实色卡逐格编辑, 校验材料数量, 并导出完整交付包.",
        workflow: "开始创作",
        quickStart: "选择工作流程",
        actionHint: "功能将按实施流程逐步启用",
      },
      actions: {
        new: {
          title: "新建空白图纸",
          description: "设置画布, 板子和分块线, 从第一颗拼豆开始.",
        },
        image: {
          title: "导入图片",
          description: "制作高分辨率母图, 再完成栅格化和色卡量化.",
        },
        csv: {
          title: "导入 CSV",
          description: "检查尺寸和未知色号后, 继续编辑已有图纸.",
        },
      },
      preview: {
        label: "编辑器界面预览",
        untitled: "未命名图纸",
        palette: "色卡",
        canvas: "画布",
        coordinates: "坐标",
        beads: "拼豆数",
      },
      recent: {
        library: "项目库",
        title: "最近项目",
        emptyTitle: "还没有最近项目",
        emptyDescription: "项目文件和异常恢复会在编辑器核心完成后接入.",
      },
      footer: {
        privacy: "默认离线处理. 图片不会被自动上传.",
        version: "基础壳 v0.1.0",
      },
    },
  },
  "en-US": {
    translation: {
      app: {
        name: "PerlerDrawing",
        desktop: "Desktop",
        homeLabel: "Return to the start page",
      },
      status: {
        offline: "Offline first",
        foundationTitle: "App foundation is ready",
        foundationDescription: "Language, themes, and the desktop runtime are connected.",
        nextStep: "Next step",
        planned: "Planned",
      },
      preferences: {
        language: "Interface language",
        chinese: "使用中文",
        english: "Use English",
        theme: "Interface theme",
        light: "Use light theme",
        dark: "Use dark theme",
        system: "Follow system theme",
      },
      home: {
        eyebrow: "Offline pattern workspace",
        title: "Turn inspiration into patterns you can actually build.",
        description:
          "Start with an image, CSV, or blank canvas. Edit bead by bead with a real palette, verify material counts, and export a complete delivery package.",
        workflow: "Create",
        quickStart: "Choose a workflow",
        actionHint: "Features unlock as each implementation step is completed",
      },
      actions: {
        new: {
          title: "New blank pattern",
          description: "Set the canvas, boards, and subdivisions, then place the first bead.",
        },
        image: {
          title: "Import image",
          description: "Prepare a high-resolution master before rasterizing and mapping colors.",
        },
        csv: {
          title: "Import CSV",
          description:
            "Check dimensions and unknown color codes before editing an existing pattern.",
        },
      },
      preview: {
        label: "Editor interface preview",
        untitled: "Untitled pattern",
        palette: "Palette",
        canvas: "Canvas",
        coordinates: "Coordinates",
        beads: "Beads",
      },
      recent: {
        library: "Project library",
        title: "Recent projects",
        emptyTitle: "No recent projects yet",
        emptyDescription: "Project files and crash recovery arrive with the editor core.",
      },
      footer: {
        privacy: "Offline by default. Images are never uploaded automatically.",
        version: "Foundation v0.1.0",
      },
    },
  },
} as const;
