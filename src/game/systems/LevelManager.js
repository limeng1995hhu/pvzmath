import { EventBus } from '../EventBus.js';
import { configManager } from './ConfigManager.js';

/**
 * 关卡管理系统
 * 负责加载关卡配置、管理敌人波次、检查关卡目标
 */
export class LevelManager {
    constructor(scene) {
        this.scene = scene;
        
        // 当前关卡信息
        this.currentLevel = null;
        this.levelId = null;

        // 关卡配置缓存
        this.levelConfigs = null;
        
        // 波次管理
        this.waves = [];
        this.currentWaveIndex = 0;
        this.waveStartTime = 0;
        this.isLevelActive = false;
        
        // 关卡目标
        this.objectives = [];
        this.completedObjectives = [];
        
        // 统计数据
        this.stats = {
            enemiesSpawned: 0,
            enemiesKilled: 0,
            energyCollected: 0,
            reactionsPerformed: 0,
            levelStartTime: 0,
            levelDuration: 0,
            // 新增：化学反应统计
            reactionStats: new Map() // 存储每种反应的触发次数和详细信息
        };
        
        this.init();
    }
    
    async init() {
        console.log('LevelManager 初始化');
        this.setupEventListeners();

        // 使用配置管理器加载配置
        await this.loadLevelConfigs();
    }

    // 使用配置管理器加载关卡配置
    async loadLevelConfigs() {
        try {
            console.log('LevelManager: 加载关卡配置...');

            // 等待配置管理器加载完成
            await configManager.loadConfigs();

            // 获取关卡配置
            this.levelConfigs = configManager.getAllLevelConfigs();

            console.log('LevelManager: 关卡配置加载完成', Object.keys(this.levelConfigs));

        } catch (error) {
            console.error('LevelManager: 加载关卡配置失败:', error);
            // 使用默认配置作为后备
            this.levelConfigs = this.getDefaultLevelConfigs();
        }
    }


    
    setupEventListeners() {
        // 监听敌人相关事件
        EventBus.on('enemy-spawned', (data) => {
            this.stats.enemiesSpawned++;
        });
        
        EventBus.on('enemy-killed', (data) => {
            this.stats.enemiesKilled++;
            // 敌人被消灭时立即检查是否可以完成关卡
            this.checkAutoComplete();
        });
        
        EventBus.on('enemy-recycled', (data) => {
            this.stats.energyCollected += data.energyReward || 0;
        });
        
        EventBus.on('reaction-occurred', (data) => {
            this.stats.reactionsPerformed++;

            // 记录化学反应的详细统计信息
            this.recordReactionStats(data);
        });
    }

    // 记录化学反应统计信息
    recordReactionStats(reactionData) {
        const reactionId = reactionData.reactionId;

        if (!this.stats.reactionStats.has(reactionId)) {
            // 初始化反应统计信息
            this.stats.reactionStats.set(reactionId, {
                id: reactionId,
                name: this.getReactionName(reactionId),
                equation: this.getReactionEquation(reactionId),
                count: 0,
                totalEnergyConsumed: 0,
                totalEnergyGained: 0,
                products: new Map() // 记录产物统计
            });
        }

        const reactionStats = this.stats.reactionStats.get(reactionId);
        reactionStats.count++;
        reactionStats.totalEnergyConsumed += reactionData.energyCost || 0;

        // 记录产物统计
        if (reactionData.products) {
            reactionData.products.forEach(product => {
                const productKey = product.substance;
                if (!reactionStats.products.has(productKey)) {
                    reactionStats.products.set(productKey, 0);
                }
                reactionStats.products.set(productKey,
                    reactionStats.products.get(productKey) + product.amount);
            });
        }

        console.log(`记录反应统计: ${reactionId}, 总次数: ${reactionStats.count}`);
    }

    // 获取反应名称
    getReactionName(reactionId) {
        // 从配置管理器获取反应名称
        const reactionConfig = configManager.getReactionConfig(reactionId);
        return reactionConfig ? reactionConfig.name : reactionId;
    }

    // 获取反应方程式
    getReactionEquation(reactionId) {
        // 从配置管理器获取反应方程式
        const reactionConfig = configManager.getReactionConfig(reactionId);
        return reactionConfig ? reactionConfig.equation : '';
    }

    // 加载关卡
    loadLevel(levelId) {
        console.log(`加载关卡: ${levelId}`);

        // 完全重置关卡管理器状态
        this.resetLevelManager();

        this.levelId = levelId;
        this.currentLevel = this.getLevelConfig(levelId);

        if (!this.currentLevel) {
            console.error(`关卡配置未找到: ${levelId}`);
            return false;
        }

        // 重置统计数据
        this.resetStats();

        // 配置关卡
        this.setupLevel();

        return true;
    }
    
    // 获取关卡配置
    getLevelConfig(levelId) {
        if (!this.levelConfigs) {
            console.warn('关卡配置未加载，使用配置管理器');
            return configManager.getLevelConfig(levelId) || this.getDefaultLevelConfig(levelId);
        }

        return this.levelConfigs[levelId] || this.getDefaultLevelConfig(levelId);
    }

    // 获取默认关卡配置（后备方案）
    getDefaultLevelConfigs() {
        return {
            'level_01': this.getDefaultLevelConfig('level_01'),
            'level_02': this.getDefaultLevelConfig('level_02'),
            'level_03': this.getDefaultLevelConfig('level_03'),
            'level_04': this.getDefaultLevelConfig('level_04'),
            'level_05': this.getDefaultLevelConfig('level_05')
        };
    }

    // 获取默认关卡配置
    getDefaultLevelConfig(levelId) {
        if (levelId === 'level_01') {
            return {
                id: 'level_01',
                name: '回收氢气',
                description: '使用回收器回收氢气敌人',
                initialEnergy: 100,
                availableBuildings: ['recycler'],
                availableItems: ['hydrogen', 'recycler'], // 兼容旧版本
                objectives: [
                    { type: 'survive', duration: 60000, description: '生存60秒' },
                    { type: 'recycle', target: 'H2', amount: 6, description: '回收6个氢气敌人' }
                ],
                waves: [
                    {
                        id: 'wave1',
                        startTime: 2000,
                        enemies: [{ substance: 'H2', amount: 1, count: 1, interval: 0 }]
                    },
                    {
                        id: 'wave2',
                        startTime: 10000,
                        enemies: [{ substance: 'H2', amount: 2, count: 1, interval: 0 }]
                    },
                    {
                        id: 'wave3',
                        startTime: 20000,
                        enemies: [{ substance: 'H2', amount: 3, count: 1, interval: 0 }]
                    }
                ]
            };
        } else if (levelId === 'level_02') {
            return {
                id: 'level_02',
                name: '水生成反应',
                description: '学习氢氧反应生成水',
                initialEnergy: 120,
                availableBuildings: ['recycler', 'reactor'],
                availableReactions: ['water_synthesis'],
                objectives: [
                    { type: 'survive', duration: 90000, description: '生存90秒' },
                    { type: 'perform_reactions', reaction: 'water_synthesis', amount: 2, description: '执行2次水合成反应' }
                ],
                waves: [
                    {
                        id: 'wave1',
                        startTime: 3000,
                        enemies: [{ substance: 'H2', amount: 2, count: 2, interval: 1000 }]
                    },
                    {
                        id: 'wave2',
                        startTime: 15000,
                        enemies: [{ substance: 'O2', amount: 1, count: 1, interval: 0 }]
                    },
                    {
                        id: 'wave3',
                        startTime: 30000,
                        enemies: [{ substance: 'H2', amount: 1, count: 2, interval: 2000 }]
                    }
                ]
            };
        } else if (levelId === 'level_03') {
            return {
                id: 'level_03',
                name: '碳与氧',
                description: '掌握两种化学反应：水合成、二氧化碳合成',
                initialEnergy: 150,
                availableBuildings: ['recycler', 'reactor'],
                availableReactions: ['water_synthesis', 'co2_synthesis', 'co_oxidation'],
                objectives: [
                    { type: 'survive', duration: 120000, description: '生存120秒' },
                    { type: 'perform_reactions', reaction: 'co2_synthesis', amount: 3, description: '执行3次二氧化碳合成反应' },
                    { type: 'recycle', target: 'C', amount: 5, description: '回收5个碳敌人' }
                ],
                waves: [
                    {
                        id: 'wave1',
                        startTime: 3000,
                        enemies: [{ substance: 'H2', amount: 2, count: 3, interval: 1500 }]
                    },
                    {
                        id: 'wave2',
                        startTime: 20000,
                        enemies: [{ substance: 'CO', amount: 2, count: 2, interval: 2000 }]
                    },
                    {
                        id: 'wave3',
                        startTime: 40000,
                        enemies: [{ substance: 'O2', amount: 1, count: 2, interval: 3000 }]
                    },
                    {
                        id: 'wave4',
                        startTime: 42000,
                        enemies: [{ substance: 'C', amount: 1, count: 2, interval: 2500 }]
                    }
                ]
            };
        } else if (levelId === 'level_04') {
            return {
                id: 'level_04',
                name: '氮气回收',
                description: '学习氨气反应',
                initialEnergy: 180,
                availableBuildings: ['recycler', 'reactor'],
                availableReactions: ['water_synthesis', 'co2_synthesis', 'ammonia_synthesis', 'ammonia_oxidation'],
                objectives: [
                    { type: 'survive', duration: 150000, description: '生存150秒' },
                    { type: 'perform_reactions', reaction: 'ammonia_synthesis', amount: 4, description: '执行4次氨气合成反应' },
                    { type: 'recycle', target: 'N2', amount: 8, description: '回收8个氮气敌人' }
                ],
                waves: [
                    {
                        id: 'wave1',
                        startTime: 3000,
                        enemies: [{ substance: 'NH3', amount: 1, count: 2, interval: 2000 }]
                    },
                    {
                        id: 'wave2',
                        startTime: 15000,
                        enemies: [{ substance: 'H2', amount: 1, count: 3, interval: 1500 }]
                    },
                    {
                        id: 'wave3',
                        startTime: 25000,
                        enemies: [{ substance: 'H2', amount: 1, count: 3, interval: 2500 }]
                    },
                    {
                        id: 'wave4',
                        startTime: 40000,
                        enemies: [{ substance: 'O2', amount: 1, count: 2, interval: 3000 }]
                    }
                ]
            };
        } else if (levelId === 'level_05') {
            return {
                id: 'level_05',
                name: '中和反应',
                description: '利用酸和碱的反应产生盐',
                initialEnergy: 180,
                availableBuildings: ['recycler', 'reactor'],
                availableReactions: ['water_synthesis', 'chlorine_water_reaction', 'chlorine_hydrogen_reaction', 'hypochlorous_acid_decomposition', 'acid_base_neutralization'],
                objectives: [
                    { type: 'survive', duration: 180000, description: '生存180秒' },
                    { type: 'perform_reactions', reaction: 'salt_synthesis', amount: 5, description: '执行5次氯化钠合成反应' },
                    { type: 'recycle', target: 'Na', amount: 10, description: '回收10个钠敌人' },
                    { type: 'energy_threshold', amount: 300, description: '累积能量达到300' }
                ],
                waves: [
                    {
                        id: 'wave1',
                        startTime: 2000,
                        enemies: [{ substance: 'Cl2', amount: 1, count: 3, interval: 3000 }]
                    }
                ]
            };
        }
        return null;
    }
    
    // 设置关卡
    setupLevel() {
        console.log('设置关卡:', this.currentLevel.name);

        // 设置初始能量
        if (this.scene.hud) {
            this.scene.hud.setEnergy(this.currentLevel.initialEnergy);
        }

        // 配置可用道具
        this.configureAvailableItems();

        // 设置关卡目标
        this.objectives = [...this.currentLevel.objectives];
        this.completedObjectives = [];

        // 设置敌人波次 - 深度复制并重置状态
        this.waves = this.currentLevel.waves.map(wave => ({
            ...wave,
            started: false,
            completed: false,
            totalEnemies: 0,
            spawnedEnemies: 0,
            enemies: [...wave.enemies] // 深度复制敌人配置
        }));
        this.currentWaveIndex = 0;

        // 重置关卡状态
        this.isLevelActive = false;

        // 显示关卡信息
        this.showLevelInfo();
    }
    
    // 配置可用道具
    configureAvailableItems() {
        // 从关卡配置获取可用道具
        let availableItems = [];

        // 支持新的availableBuildings字段
        if (this.currentLevel.availableBuildings) {
            availableItems = [...this.currentLevel.availableBuildings];
        }

        // 兼容旧的availableItems字段
        if (this.currentLevel.availableItems) {
            availableItems = [...this.currentLevel.availableItems];
        }

        // 根据关卡添加特定元素
        if (this.currentLevel.id === 'level_01') {
            // 关卡一：添加氢气元素
            if (!availableItems.includes('hydrogen')) {
                availableItems.unshift('hydrogen');
            }
        } else if (this.currentLevel.id === 'level_02') {
            // 关卡二：添加氧气、水元素
            if (!availableItems.includes('oxygen')) {
                availableItems.unshift('oxygen');
            }
            if (!availableItems.includes('water')) {
                availableItems.unshift('water');
            }
        } else if (this.currentLevel.id === 'level_03') {
            // 关卡三：添加氧气、水、二氧化碳元素
            if (!availableItems.includes('oxygen')) {
                availableItems.unshift('oxygen');
            }
            if (!availableItems.includes('water')) {
                availableItems.unshift('water');
            }
            if (!availableItems.includes('co2')) {
                availableItems.unshift('co2');
            }
        } else if (this.currentLevel.id === 'level_04') {
            // 关卡四：添加氮气、氧气、水元素
            if (!availableItems.includes('nitrogen')) {
                availableItems.unshift('nitrogen');
            }
            if (!availableItems.includes('oxygen')) {
                availableItems.unshift('oxygen');
            }
            if (!availableItems.includes('water')) {
                availableItems.unshift('water');
            }
        } else if (this.currentLevel.id === 'level_05') {
            // 关卡五：添加水、氢气、氯化钠、氢氧化钠元素
            if (!availableItems.includes('water')) {
                availableItems.unshift('water');
            }
            if (!availableItems.includes('hydrogen')) {
                availableItems.unshift('hydrogen');
            }
            if (!availableItems.includes('salt')) {
                availableItems.unshift('salt');
            }
            if (!availableItems.includes('naoh')) {
                availableItems.unshift('naoh');
            }
        }

        console.log('可用道具:', availableItems);

        // 发送事件通知道具栏更新
        EventBus.emit('level-items-configured', {
            availableItems: availableItems
        });
    }
    
    // 显示关卡信息
    showLevelInfo() {
        // 不再显示关卡目标信息，只在控制台记录
        console.log(`关卡加载完成: ${this.currentLevel.name}`);
        console.log('关卡目标:', this.objectives.map(obj => obj.description));
    }
    
    // 开始关卡
    startLevel() {
        console.log('开始关卡');
        
        this.isLevelActive = true;
        this.stats.levelStartTime = this.scene.time.now;
        this.waveStartTime = this.scene.time.now;
        
        // 停止当前的敌人生成
        if (this.scene.enemyManager) {
            this.scene.enemyManager.stopSpawning();
        }
        
        // 发送关卡开始事件
        EventBus.emit('level-started', {
            levelId: this.levelId,
            levelName: this.currentLevel.name
        });
    }
    
    // 更新关卡状态
    update(time, delta) {
        if (!this.isLevelActive) return;
        
        // 更新关卡持续时间
        this.stats.levelDuration = time - this.stats.levelStartTime;
        
        // 处理敌人波次
        this.updateWaves(time);
        
        // 检查关卡目标
        this.checkObjectives(time);
    }
    
    // 更新敌人波次
    updateWaves(time) {
        const elapsedTime = time - this.waveStartTime;
        
        // 检查是否有新的波次需要开始
        for (let i = this.currentWaveIndex; i < this.waves.length; i++) {
            const wave = this.waves[i];
            
            if (elapsedTime >= wave.startTime && !wave.started) {
                this.startWave(wave);
                wave.started = true;
                this.currentWaveIndex = i + 1;
            }
        }
    }
    
    // 开始波次
    startWave(wave) {
        console.log(`开始波次: ${wave.id}`);

        // 计算这个波次总共需要生成多少敌人
        let totalEnemies = 0;
        wave.enemies.forEach(enemyConfig => {
            totalEnemies += enemyConfig.count;
        });

        // 初始化波次状态
        wave.totalEnemies = totalEnemies;
        wave.spawnedEnemies = 0;
        wave.completed = false;

        // 生成波次中的敌人
        wave.enemies.forEach(enemyConfig => {
            this.spawnWaveEnemy(enemyConfig, wave);
        });

        // 显示波次信息
        if (this.scene.hud) {
            this.scene.hud.showMessage(`${wave.id} 开始！`, '#ff6600', 2000);
        }
    }
    
    // 生成波次敌人
    spawnWaveEnemy(enemyConfig, wave) {
        console.log(`尝试生成波次敌人:`, enemyConfig, `波次:`, wave.id);

        if (!this.scene.enemyManager) {
            console.error('EnemyManager 不存在，无法生成敌人');
            return;
        }

        for (let i = 0; i < enemyConfig.count; i++) {
            setTimeout(() => {
                console.log(`生成第 ${i + 1} 个敌人: ${enemyConfig.substance}`);
                const enemy = this.scene.enemyManager.spawnEnemy(enemyConfig.substance);

                if (enemy) {
                    // 设置敌人的物质数量
                    enemy.substanceAmount = enemyConfig.amount;
                    enemy.maxSubstanceAmount = enemyConfig.amount;
                    enemy.updateAmountDisplay();

                    console.log(`✅ 成功生成波次敌人: ${enemyConfig.substance} ×${enemyConfig.amount}`);

                    // 更新波次生成进度（只有成功生成时才计数）
                    wave.spawnedEnemies++;
                    if (wave.spawnedEnemies >= wave.totalEnemies) {
                        wave.completed = true;
                        console.log(`✅ 波次 ${wave.id} 所有敌人生成完毕 (${wave.spawnedEnemies}/${wave.totalEnemies})`);
                    }
                } else {
                    console.error(`❌ 生成敌人失败: ${enemyConfig.substance}`);
                }
            }, i * (enemyConfig.interval || 0));
        }
    }
    
    // 检查关卡目标
    checkObjectives(time) {
        this.objectives.forEach((objective, index) => {
            if (this.completedObjectives.includes(index)) return;
            
            let completed = false;
            
            switch (objective.type) {
                case 'survive':
                    completed = this.stats.levelDuration >= objective.duration;
                    break;
                case 'recycle':
                    // 这里需要更精确的回收统计
                    completed = this.stats.enemiesKilled >= objective.amount;
                    break;
                case 'collect_energy':
                    completed = this.stats.energyCollected >= objective.amount;
                    break;
                case 'perform_reactions':
                    // 检查是否执行了足够次数的反应
                    completed = this.stats.reactionsPerformed >= objective.amount;
                    break;
            }
            
            if (completed) {
                this.completeObjective(index, objective);
            }
        });
        
        // 检查是否所有目标都完成
        if (this.completedObjectives.length === this.objectives.length) {
            this.completeLevel();
        }

        // 检查是否所有波次结束且场面上没有敌人
        this.checkAutoComplete();
    }
    
    // 检查自动完成条件
    checkAutoComplete() {
        // 如果关卡已经完成，不需要再检查
        if (!this.isLevelActive) {
            return;
        }

        // 检查是否所有波次都已经开始
        const allWavesStarted = this.waves.every(wave => wave.started);

        // 检查是否所有波次的敌人都已经生成完毕
        const allWavesCompleted = this.waves.every(wave => wave.completed);

        // 检查场面上是否还有敌人
        const enemyCount = this.scene.enemyManager ? this.scene.enemyManager.getActiveEnemyCount() : 0;

        // 移除频繁的调试日志

        // 如果所有波次都完成且场面上没有敌人，自动完成关卡
        if (allWavesStarted && allWavesCompleted && enemyCount === 0) {
            console.log('所有波次完成且场面清空，自动完成关卡');
            this.completeLevel();
        }
    }

    // 完成目标
    completeObjective(index, objective) {
        this.completedObjectives.push(index);
        console.log(`目标完成: ${objective.description}`);

        // 不再显示目标完成消息，只在控制台记录
        // if (this.scene.hud) {
        //     this.scene.hud.showMessage(`✅ ${objective.description}`, '#00ff00', 3000);
        // }

        EventBus.emit('objective-completed', {
            objectiveIndex: index,
            objective: objective
        });
    }
    
    // 完成关卡
    completeLevel() {
        console.log('关卡完成！');

        this.isLevelActive = false;

        // 停止所有敌人生成和更新
        if (this.scene.enemyManager) {
            this.scene.enemyManager.stopSpawning();
        }

        // 显示关卡完成弹窗
        this.showLevelCompleteDialog();

        EventBus.emit('level-completed', {
            levelId: this.levelId,
            stats: this.stats,
            duration: this.stats.levelDuration
        });
    }

    // 显示关卡完成弹窗
    showLevelCompleteDialog() {
        const { width, height } = this.scene.cameras.main;

        // 创建半透明背景遮罩
        const overlay = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
        overlay.setDepth(1000);
        overlay.setInteractive(); // 阻止点击穿透

        // 创建弹窗背景
        const dialogBg = this.scene.add.rectangle(width / 2, height / 2, 600, 400, 0x1a1a2e, 0.95);
        dialogBg.setDepth(1001);
        dialogBg.setStrokeStyle(4, 0x4ecdc4);

        // 标题
        const title = this.scene.add.text(width / 2, height / 2 - 120, '🎉 关卡完成！', {
            fontFamily: 'Arial Bold',
            fontSize: '48px',
            color: '#4ecdc4',
            resolution: 2
        }).setOrigin(0.5).setDepth(1002);

        // 基础统计信息
        const basicStatsText = [
            `关卡：${this.currentLevel.name}`,
            `用时：${Math.floor(this.stats.levelDuration / 1000)}秒`,
            `消灭敌人：${this.stats.enemiesKilled}`,
            `收集能量：${this.stats.energyCollected}`
        ].join('\n');

        const basicStats = this.scene.add.text(width / 2, height / 2 - 80, basicStatsText, {
            fontFamily: 'Arial',
            fontSize: '20px',
            color: '#ffffff',
            align: 'center',
            lineSpacing: 8,
            resolution: 2
        }).setOrigin(0.5).setDepth(1002);

        // 确认按钮
        const buttonBg = this.scene.add.rectangle(width / 2, height / 2 + 120, 200, 60, 0x4ecdc4, 0.9);
        buttonBg.setDepth(1002);
        buttonBg.setStrokeStyle(2, 0xffffff);
        buttonBg.setInteractive({ useHandCursor: true });

        const buttonText = this.scene.add.text(width / 2, height / 2 + 120, '返回主菜单', {
            fontFamily: 'Arial Bold',
            fontSize: '24px',
            color: '#1a1a2e',
            resolution: 2
        }).setOrigin(0.5).setDepth(1003);

        // 按钮交互效果
        buttonBg.on('pointerover', () => {
            buttonBg.setFillStyle(0x5fd3d3);
            buttonBg.setScale(1.05);
        });

        buttonBg.on('pointerout', () => {
            buttonBg.setFillStyle(0x4ecdc4);
            buttonBg.setScale(1.0);
        });

        // 点击返回主菜单
        buttonBg.on('pointerdown', () => {
            console.log('返回主菜单');
            this.scene.scene.start('MainMenu');
        });

        // 化学反应统计信息
        const reactionStatsText = this.generateReactionStatsText();
        let reactionStats = null;
        if (reactionStatsText) {
            reactionStats = this.scene.add.text(width / 2, height / 2 + 20, reactionStatsText, {
                fontFamily: 'Arial',
                fontSize: '18px',
                color: '#4ecdc4',
                align: 'center',
                lineSpacing: 6,
                resolution: 2
            }).setOrigin(0.5).setDepth(1002);
        }

        // 存储弹窗元素以便后续清理
        this.levelCompleteDialog = {
            overlay,
            dialogBg,
            title,
            basicStats,
            reactionStats,
            buttonBg,
            buttonText
        };
    }

    // 生成化学反应统计文本
    generateReactionStatsText() {
        if (this.stats.reactionStats.size === 0) {
            return null; // 没有反应发生
        }

        const reactionLines = ['🧪 化学反应统计：'];

        // 按反应次数排序
        const sortedReactions = Array.from(this.stats.reactionStats.values())
            .sort((a, b) => b.count - a.count);

        sortedReactions.forEach(reaction => {
            // 显示反应方程式和次数
            reactionLines.push(`${reaction.equation} ×${reaction.count}`);
        });

        return reactionLines.join('\n');
    }

    // 完全重置关卡管理器状态
    resetLevelManager() {
        console.log('完全重置关卡管理器状态');

        // 重置关卡状态
        this.isLevelActive = false;

        // 重置波次管理
        this.waves = [];
        this.currentWaveIndex = 0;
        this.waveStartTime = 0;

        // 重置关卡目标
        this.objectives = [];
        this.completedObjectives = [];

        // 清理关卡完成弹窗（如果存在）
        this.clearLevelCompleteDialog();

        // 重置统计数据
        this.resetStats();
    }

    // 清理关卡完成弹窗
    clearLevelCompleteDialog() {
        if (this.levelCompleteDialog) {
            console.log('清理关卡完成弹窗');

            // 销毁所有弹窗元素
            Object.values(this.levelCompleteDialog).forEach(element => {
                if (element && element.destroy) {
                    element.destroy();
                }
            });

            this.levelCompleteDialog = null;
        }
    }

    // 重置统计数据
    resetStats() {
        this.stats = {
            enemiesSpawned: 0,
            enemiesKilled: 0,
            energyCollected: 0,
            reactionsPerformed: 0,
            levelStartTime: 0,
            levelDuration: 0,
            // 重置化学反应统计
            reactionStats: new Map()
        };
    }
    
    // 获取关卡进度
    getLevelProgress() {
        return {
            levelId: this.levelId,
            levelName: this.currentLevel?.name || '',
            objectives: this.objectives,
            completedObjectives: this.completedObjectives,
            stats: this.stats,
            isActive: this.isLevelActive
        };
    }
    
    // 销毁管理器
    destroy() {
        this.isLevelActive = false;
        
        // 清理事件监听
        EventBus.off('enemy-spawned');
        EventBus.off('enemy-killed');
        EventBus.off('enemy-recycled');
        EventBus.off('reaction-occurred');
        
        console.log('LevelManager 已销毁');
    }
}
