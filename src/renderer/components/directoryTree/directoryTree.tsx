import React, { Component, PureComponent, cloneElement } from 'react';
import { FileImageOutlined, RightOutlined, DownOutlined, LoadingOutlined, NodeExpandOutlined, CloseOutlined, SyncOutlined, FolderOutlined, MenuUnfoldOutlined, MenuFoldOutlined } from '@ant-design/icons';
import { isUndefinedOrNull, isArray } from '@/common/utils/types';
import style from './directoryTree.scss';
import { extractDirUrlFromKey } from '@/common/utils/businessTools';
import { EventHub } from '@/common/eventHub';
import { eventConstant } from '@/common/constant/event.constant';
import { Gesture } from '@/renderer/utils/gesture';
import { emptyCall } from '@/common/utils/functionTools';
import { hintMainText, hintText } from '@/renderer/utils/tools';
import { WithTranslation, withTranslation } from 'react-i18next';

class DirectoryTree extends PureComponent<IDirectoryTreeProps & WithTranslation, IDirectoryTreeState> {
    test: any = {};
    cloneEl: Node[] = [];

    constructor(props: IDirectoryTreeProps) {
        super(props);

        this.state = {
            expandedKeys: [],
            selectedNodes: [],
            loadingKeys: [],
            draggingNodes: [],
            lastSelectedNode: null,
            selectedNodesHistory: []
        };

    }

    componentDidMount() {
        this.initEvent();
    }

    initEvent = () => {
        Gesture.registry({ mouseType: 'LR' }, [{ direction: 'T', minDistance: 200 }], this.openModal);
    }

    openModal = () => {
        const selectedKeys = this.state.selectedNodes.map(node => node.key);
        EventHub.emit(eventConstant.SHOW_MANAGE_BAR, selectedKeys);
    }

    handleCloseManagePanel = () => {
        EventHub.emit(eventConstant.HIDDEN_MANAGE_BAR);
    }

    async handleClickNode(event: React.MouseEvent, node: ITreeDataNode) {
        event.stopPropagation();
        if ((event.shiftKey || event.buttons === 2) && this.state.lastSelectedNode) this.multiSelectDir(event, node);
        else if (event.ctrlKey || event.buttons === 2) this.selectDir(event, node);
        else this.openDir(event, node);
    }

    multiSelectDir = (event: React.MouseEvent, targetNodes: ITreeDataNode) => {
        const lastSelectedNode = this.state.lastSelectedNode;
        const treeData = this.props.treeData;
        const treeNodesMap = this.buildTreeNodesMap(treeData, []);

        // traverse all node and push the node which should be selected into `selectedArea`
        const selectedArea: ITreeDataNode[] = [];
        let startFlags = false;
        let endFlags = false;
        for (let i = 0; i < treeNodesMap.length; i++) {
            const node = treeNodesMap[i];
            if (node.key === lastSelectedNode.key) startFlags = true;
            if (node.key === targetNodes.key) endFlags = true;
            if (startFlags || endFlags) selectedArea.push(node);
            if (startFlags && endFlags) break;
        }

        const operationNodesArray = this.state.selectedNodesHistory.length === 0 ? this.state.selectedNodes : this.state.selectedNodesHistory;
        const combindArray = treeNodesMap.filter(node => operationNodesArray.some(n => n.key === node.key));

        let newSelectedNodes = null;
        newSelectedNodes = Array.from(new Set([...combindArray, ...selectedArea]));

        this.setState({
            selectedNodes: newSelectedNodes,
            selectedNodesHistory: combindArray
        });
    }

    buildTreeNodesMap = (nodes: ITreeDataNode[], nodesMap: ITreeDataNode[]) => {
        nodes.forEach(node => {
            const { children, ...newNode } = node;
            nodesMap.push(newNode);
            if (node.children && this.state.expandedKeys.includes(node.key)) this.buildTreeNodesMap(node.children, nodesMap);
            // if (node.children) this.buildTreeNodesMap(node.children, nodesMap);
        });
        return nodesMap;
    }

    selectDir(event: React.MouseEvent, node: ITreeDataNode) {
        const selectedNodes = this.state.selectedNodes.filter(n => n.key !== node.key);
        if (selectedNodes.length === this.state.selectedNodes.length) {
            selectedNodes.push(node);
        }
        this.setState({ selectedNodes, lastSelectedNode: node, selectedNodesHistory: [] });
    }

    openDir = async (event: React.MouseEvent, node: ITreeDataNode) => {
        const keyPosInRecord = this.state.expandedKeys.indexOf(node.key);
        const loadDataCb = this.props.loadData;
        const onSelectCb = this.props.onSelect;
        const onFold = this.props.onFold;
        const shouldInvokeLoadData = !this.state.expandedKeys.includes(node.key) && loadDataCb && !node.children;
        const shouldFoldNode = this.state.expandedKeys.includes(node.key) && onFold && node.children;
        const selectedNodes = [node];
        const selectedKeys = selectedNodes.map(node => node.key);

        // 1. expand/fold root node
        // 2. select node
        // 3. set node to loading status
        let expandedKeys;
        if (keyPosInRecord === -1) {
            expandedKeys = [...this.state.expandedKeys, node.key];
            this.setState({ expandedKeys, selectedNodes, lastSelectedNode: node, selectedNodesHistory: [] });
        } else {
            expandedKeys = [...this.state.expandedKeys];
            expandedKeys.splice(keyPosInRecord, 1);
            this.setState({ expandedKeys, selectedNodes, lastSelectedNode: node, selectedNodesHistory: [] });
        }

        // invoke loadData callback function.
        if (shouldInvokeLoadData) {
            if (onSelectCb && this.props.selectAwaitLoad) await loadDataCb(node);
            else loadDataCb(node);
        }

        if (shouldFoldNode) {
            onFold(node);
            const shouldSaveKeys = expandedKeys.filter((expdKey) => {
                if (expdKey === node.key) return false;
                return true;
            });
            this.setState({
                expandedKeys: shouldSaveKeys
            });
        }

        //  invoke onSelect callback function.
        if (onSelectCb) {
            onSelectCb(selectedKeys, {
                event: 'select',
                selected: keyPosInRecord === -1,
                node,
                selectedNodes: this.state.selectedNodes,
                nativeEvent: event
            });
        }
    }

    handleClickBackground = (event: React.MouseEvent) => {
        this.setState({
            selectedNodes: []
        });
    }

    handleDragNodeStart = (e: React.DragEvent, node: ITreeDataNode) => {
        e.stopPropagation();
        let urls: string[] = [];
        const curSelectedKeys = this.state.selectedNodes.map(node => node.key);
        if (curSelectedKeys.includes(node.key)) urls = this.state.selectedNodes.map(node => extractDirUrlFromKey(node.key));
        else urls = this.buildTreeNodesMap([node], []).map(node => extractDirUrlFromKey(node.key));

        urls = urls.filter((urlForCheck, index) =>
            !urls.some(url => (urlForCheck !== url) && (url.includes(urlForCheck + '\\'))));

        const urlsDataString = urls.join('?|?');
        const dt = e.dataTransfer;
        const img = new Image();
        dt.setDragImage(img, 0, 0);
        dt.setData('urls', urlsDataString);
    }

    handleDragNodeEnd = (e: React.DragEvent) => {
    }

    handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        const dt = e.dataTransfer;
        // dt.dropEffect = 'copy';
    }

    deleteDir = (e: React.MouseEvent, key: string) => {
        e.stopPropagation();
        this.props.onDeleteUrl ? this.props.onDeleteUrl(key) : emptyCall();
    }

    hintText = () => {
        const t = this.props.t;

        hintText(
            [
                {
                    text: `【ctrl / shift + ${t('%leftClick%')}】`,
                    color: 'rgb(255, 0, 200)',
                    margin: 4
                },
                {
                    text: t('%multipleSelect%'),
                    margin: 24
                },
                {
                    text: t('%singleClick%'),
                    color: 'rgb(255, 0, 200)',
                    margin: 4
                },
                {
                    text: t('%openSingleAlbum%'),
                    margin: 24
                },
                {
                    text: t('%dragToPreview%'),
                    color: 'rgb(255, 0, 200)',
                    margin: 4
                },
                {
                    text: t('%openAllSelected%')
                }
            ]
        );
    }

    syncDirTree = () => {
        this.props.onSyncData ? this.props.onSyncData() : emptyCall();
    }

    renderLeaf(node: ITreeDataNode) {
        const res = (
            <div className={style.nodeLeaf} key={node.key}>
                <div className={style.icon}>
                    <FileImageOutlined />
                </div>
                <div className={`${style.title} text-ellipsis-1`}>{!isUndefinedOrNull(node.title) ? node.title : node.key}</div>
            </div>
        );
        return res;
    }

    renderRoot(node: ITreeDataNode, isChild?: boolean) {
        const isExpanded: boolean = this.state.expandedKeys.includes(node.key);

        const NodeChildren = (
            <div className={style.nodeRootChildren}>
                {isArray(node.children) ? node.children.map(node => (node.isLeaf ? this.renderLeaf(node) : this.renderRoot(node, true))) : ''}
            </div>
        );

        const isSelected = this.state.selectedNodes.findIndex(nodeInState => nodeInState.key === node.key) !== -1;

        const res = (
            <div
                className={style.nodeRoot} key={node.key}
                onDragStart={(e: React.DragEvent) => { this.handleDragNodeStart(e, node); }}
                onDragEnd={this.handleDragNodeEnd}
                draggable>
                <div
                    onMouseEnter={() => { hintMainText(node.title); }}
                    className={`${style.nodeRootTitleWrapper} ${isSelected ? style.selected : ''}`}
                    onClick={(e: React.MouseEvent) => {
                        this.handleClickNode(e, node);
                    }}
                >
                    <div className={style.icon}>
                        {isExpanded ? <DownOutlined /> : <RightOutlined />}
                    </div>
                    <div className={`${style.nodeRootTitle}`}>{!isUndefinedOrNull(node.title) ? node.title : node.key}</div>

                    {!isChild ? (<div className={style.closeButton} onClick={(e: React.MouseEvent) => { this.deleteDir(e, node.key); }}> <CloseOutlined /> </div>) : ''}
                </div>
                {isExpanded ? NodeChildren : ''}
            </div>
        );
        this.test[node.key] ? this.test[node.key]++ : this.test[node.key] = 1;
        return res;
    }

    foldAll = () => {
        this.setState({
            expandedKeys: []
        });
    }

    renderControlBar = () => {
        const t = this.props.t;

        return (<div className={style.controlBar}>
            <div
                className={style.button}
                onClick={this.syncDirTree}
                onMouseEnter={() => {
                    hintMainText(t('%syncDirTree%'));
                }}
                onMouseLeave={() => {
                    hintMainText('');
                }}>
                <SyncOutlined />
            </div>
            <div
                className={style.button}
                onClick={this.foldAll}
                onMouseEnter={() => {
                    hintMainText(t('%foldAll%'));
                }}
                onMouseLeave={() => {
                    hintMainText('');
                }}>
                <MenuFoldOutlined />
            </div>
        </div>);
    }

    render() {
        const t = this.props.t;
        const treeData = this.props.treeData;
        const className = this.props.className;
        const ControlBar = this.renderControlBar;

        return (
            <div className={style.tree}>
                <ControlBar />

                <div
                    onMouseEnter={this.hintText}
                    onMouseLeave={() => { hintText([{ text: t('%openSettingDesc%'), color: 'rgb(255, 0, 200)', margin: 4 }, { text: t('%openSetting%') }]); }}
                    className={`${style.treeRootWrapper} ${className}`}
                    onClick={this.handleClickBackground}
                    onDragOver={this.handleDragOver} >
                    <div className={style.treeRoot}>
                        {treeData.map(node => (node.isLeaf ? this.renderLeaf(node) : this.renderRoot(node)))}
                    </div>
                </div>
            </div>

        );
    }
}

export interface IDirectoryTreeState {
    expandedKeys: string[];
    selectedNodes: ITreeDataNode[];
    loadingKeys: string[];
    lastSelectedNode: ITreeDataNode;
    selectedNodesHistory: ITreeDataNode[];
    draggingNodes: ITreeDataNode[];
}

export interface IDirectoryTreeProps extends WithTranslation {
    className: any;
    treeData: ITreeDataNode[];
    onSelect?(
        keys: string[],
        event: {
            event: 'select';
            selected: boolean;
            node: ITreeDataNode;
            selectedNodes: ITreeDataNode[];
            nativeEvent: React.MouseEvent;
        }
    ): void;
    loadData?(treeNode: ITreeDataNode): Promise<void>;
    onFold?(treeNode: ITreeDataNode): void;
    selectAwaitLoad?: boolean;
    onDeleteUrl?(key: string): void;
    onSyncData?(): void;
}

export interface ITreeDataNode {
    key: string;
    title?: string;
    data?: any;
    children?: ITreeDataNode[];
    isLeaf?: boolean;
}

const directoryTree = withTranslation()(DirectoryTree);
export { directoryTree as DirectoryTree };