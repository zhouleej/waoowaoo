from maas_seedance import MaasSeedanceClient
import json
import logging
import time
# 移动云配置（用户需替换为实际值）
MAAS_BASE_URL = "https://zhenze-huhehaote.cmecloud.cn/api/v3"  # 移动云网关地址
MAAS_API_KEY = "APIKEY" # 移动云API Key
MAAS_MODEL = "doubao-seedance-2.0"                           # 移动云模型名

# 有则填写，没有会根据路径自动生成
PUBLIC_KEY_PATH = "./tmp/seedance_pub.pem"
PRIVATE_KEY_PATH = "./tmp/seedance_priv.pem"

if __name__ == "__main__":

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s - %(message)s",
    )

    # 初始化客户端
    client = MaasSeedanceClient(
        maas_base_url=MAAS_BASE_URL,
        maas_api_key=MAAS_API_KEY,
        maas_model=MAAS_MODEL,
        enable_video_encrypt=True # 是否启用视频文件加密
    )

    # # 设置加密密钥
    client.set_video_file_encrypt_key(
        public_key_path=PUBLIC_KEY_PATH,
        private_key_path=PRIVATE_KEY_PATH,
    )

    # # 创建任务
    request_data = {
        "content": [
            {
                "type": "text",
                "text": "全程使用视频1的第一视角构图，全程使用音频1作为背景音乐。第一人称视角果茶宣传广告，seedance牌「苹苹安安」苹果果茶限定款；首帧为图片1，你的手摘下一颗带晨露的阿克苏红苹果，轻脆的苹果碰撞声；2-4 秒：快速切镜，你的手将苹果块投入雪克杯，加入冰块与茶底，用力摇晃，冰块碰撞声与摇晃声卡点轻快鼓点，背景音：「鲜切现摇」；4-6 秒：第一人称成品特写，分层果茶倒入透明杯，你的手轻挤奶盖在顶部铺展，在杯身贴上粉红包标，镜头拉近看奶盖与果茶的分层纹理；6-8 秒：第一人称手持举杯，你将图片2中的果茶举到镜头前（模拟递到观众面前的视角），杯身标签清晰可见，背景音「来一口鲜爽」，尾帧定格为图片2。背景声音统一为女生音色。"
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg"
                },
                "role": "reference_image"
            },
            {
                "type": "image_url",
                "image_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg"
                },
                "role": "reference_image"
            },
            {
                "type": "video_url",
                "video_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_video/r2v_tea_video1.mp4"
                },
                "role": "reference_video"
            },
            {
                "type": "audio_url",
                "audio_url": {
                    "url": "https://ark-project.tos-cn-beijing.volces.com/doc_audio/r2v_tea_audio1.mp3"
                },
                "role": "reference_audio"
            }
        ],
        "generate_audio": True,
        "ratio": "16:9",
        "duration": 11,
        "watermark": False
    }
    task_id = client.create_video_generation_task(request_data)
    print(f"Created task: {task_id}")

    # 查询任务, 直到任务成功并下载视频
    pending = True
    if task_id:
        while pending:
            time.sleep(10)
            task_info = client.query_video_generation_task(task_id)
            print(
                f"Task info: {json.dumps(task_info, indent=2, ensure_ascii=False)}")
            if task_info.get("status") == "succeeded":
                pending = False
                print("Task succeeded!")
                # 下载视频
                success = client.download_video(task_id, "./tmp/output.mp4")
                print(f"Download success: {success}")
            elif task_info.get("status") == "failed":
                pending = False
                print("Task failed!")
            else:
                print("Task is running")

    # 查询任务列表
    # task_list = client.query_video_generation_task_list(
    #     page_num=1, page_size=10, status="succeeded")
    # print(f"Task list: {json.dumps(task_list, indent=2, ensure_ascii=False)}")

    # # 下载视频
    # success = client.download_video('cgt-20260430091723-lg9d5', "./tmp/output.mp4")
    # print(f"Download success: {success}")

    # # 删除任务
    # deleted = client.delete_video_generation_task(task_id)
    # print(f"Deleted: {deleted}")
